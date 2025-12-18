import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Person } from './person.entity';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreatePersonDto } from './dtos/create-person.dto';
import { UpdatePersonDto } from './dtos/update-person.dto';
import { PromoteAncestorDto } from './dtos/promote-ancestor.dto';

@Injectable()
export class PersonsService {
  constructor(
    @InjectRepository(Person) private personRepository: Repository<Person>,
    private dataSource: DataSource,
  ) {}

  private async wouldCreateAncestryCycle(
    potentialAncestorId: number,
    startPersonId: number,
  ): Promise<boolean> {
    // Returns true if `potentialAncestorId` appears in the parent-chain of `startPersonId`.
    // Linking `potentialAncestorId` as a parent of `startPersonId` would then create a cycle.
    const visited = new Set<number>();
    const stack: number[] = [startPersonId];

    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId) continue;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const current = await this.personRepository.findOneBy({ id: currentId });
      if (!current) continue;

      const fatherId = current.fatherId;
      const motherId = current.motherId;

      if (
        fatherId === potentialAncestorId ||
        motherId === potentialAncestorId
      ) {
        return true;
      }

      if (fatherId && !visited.has(fatherId)) stack.push(fatherId);
      if (motherId && !visited.has(motherId)) stack.push(motherId);
    }

    return false;
  }

  async create(createPersonDto: CreatePersonDto): Promise<Person> {
    // Step 1: Validate that person is connected to the tree
    await this.validateNotOrphan(createPersonDto);

    // Step 2: Validate parents exist and have correct gender
    await this.validateParents(
      createPersonDto.fatherId,
      createPersonDto.motherId,
    );

    // Step 3: Validate birth dates make sense (when adding child to existing parents)
    await this.validateParentDates(
      createPersonDto.birthDate,
      createPersonDto.fatherId,
      createPersonDto.motherId,
    );

    // Step 4: Validate children if provided (for adding unknown ancestors)
    const childrenToLink = await this.validateChildren(
      createPersonDto.childrenIds,
      createPersonDto.gender,
      createPersonDto.birthDate,
      createPersonDto.deathDate,
    );

    // Step 5: Create person (exclude childrenIds from entity creation)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { childrenIds, ...entityData } = createPersonDto;
    const newPerson = this.personRepository.create(entityData);
    const savedPerson = await this.personRepository.save(newPerson);

    // Step 6: Link children to this parent
    if (childrenToLink.length > 0) {
      await this.linkChildrenToParentInternal(savedPerson, childrenToLink);
    }

    return savedPerson;
  }

  /**
   * Validates that children exist, don't already have a parent of this gender,
   * and that the parent's birth/death dates are valid relative to the children.
   * Returns the children entities for linking.
   */
  private async validateChildren(
    childrenIds?: number[],
    gender?: string,
    parentBirthDate?: string,
    parentDeathDate?: string,
  ): Promise<Person[]> {
    if (!childrenIds || childrenIds.length === 0) return [];

    if (!gender) {
      throw new BadRequestException('Gender is required when linking children');
    }

    const children = await this.personRepository.findBy(
      childrenIds.map((id) => ({ id })),
    );

    if (children.length !== childrenIds.length) {
      throw new BadRequestException('One or more children not found');
    }

    // Check none already have a parent of this gender
    const parentField = gender === 'male' ? 'fatherId' : 'motherId';
    const childWithParent = children.find((child) => child[parentField]);

    if (childWithParent) {
      const parentType = gender === 'male' ? 'father' : 'mother';
      throw new BadRequestException(
        `${childWithParent.firstName} already has a ${parentType}`,
      );
    }

    // Validate parent birth/death dates relative to children
    this.validateParentDatesForChildren(
      children,
      gender,
      parentBirthDate,
      parentDeathDate,
    );

    return children;
  }

  /**
   * Validates that a parent's birth/death dates make sense relative to their children.
   * - Parent must be born at least 14 years before the earliest child
   * - Parent must be alive at conception/birth of each child
   * - Death must be after birth
   */
  private validateParentDatesForChildren(
    children: Person[],
    parentGender: string,
    parentBirthDate?: string,
    parentDeathDate?: string,
  ): void {
    const MIN_PARENT_AGE = 14;

    // Validate death is after birth
    if (parentBirthDate && parentDeathDate) {
      const birthYear = parseInt(parentBirthDate.split('-')[0], 10);
      const deathYear = parseInt(parentDeathDate.split('-')[0], 10);
      if (deathYear < birthYear) {
        throw new BadRequestException('Death date cannot be before birth date');
      }
    }

    if (!parentBirthDate) return; // Can't validate without birth date

    const parentBirthYear = parseInt(parentBirthDate.split('-')[0], 10);
    const parentDeathYear = parentDeathDate
      ? parseInt(parentDeathDate.split('-')[0], 10)
      : null;

    for (const child of children) {
      if (!child.birthDate) continue;

      const childBirthYear = parseInt(child.birthDate.split('-')[0], 10);

      // Parent must be born at least MIN_PARENT_AGE years before child
      const parentAgeAtChildBirth = childBirthYear - parentBirthYear;
      if (parentAgeAtChildBirth < MIN_PARENT_AGE) {
        throw new BadRequestException(
          `Parent must be at least ${MIN_PARENT_AGE} years old when ${child.firstName} was born (born ${childBirthYear}). ` +
            `With birth year ${parentBirthYear}, parent would be ${parentAgeAtChildBirth} years old.`,
        );
      }

      // Parent must be alive at conception/birth
      if (parentDeathYear) {
        if (parentGender === 'male') {
          // Father must be alive for conception (up to 1 year before birth)
          if (parentDeathYear < childBirthYear - 1) {
            throw new BadRequestException(
              `Father must be alive for conception of ${child.firstName} (born ${childBirthYear}). ` +
                `Death year ${parentDeathYear} is too early.`,
            );
          }
        } else {
          // Mother must be alive at birth
          if (parentDeathYear < childBirthYear) {
            throw new BadRequestException(
              `Mother must be alive at birth of ${child.firstName} (born ${childBirthYear}). ` +
                `Death year ${parentDeathYear} is too early.`,
            );
          }
        }
      }
    }
  }

  /**
   * Links children to a newly created parent by updating their fatherId/motherId (internal helper)
   */
  private async linkChildrenToParentInternal(
    parent: Person,
    children: Person[],
  ): Promise<void> {
    const updateField = parent.gender === 'male' ? 'fatherId' : 'motherId';

    await Promise.all(
      children.map((child) =>
        this.personRepository.update(child.id, { [updateField]: parent.id }),
      ),
    );
  }

  /**
   * Public method to link an existing person to children as their parent.
   * Validates that the parent exists and has the correct gender for the parent type.
   * Validates that children don't already have a parent of this type.
   */
  async linkChildrenToParent(
    parentId: number,
    childrenIds: number[],
    parentType: 'father' | 'mother',
  ): Promise<{ message: string; updated: number }> {
    // Find the parent
    const parent = await this.personRepository.findOneBy({ id: parentId });
    if (!parent) {
      throw new NotFoundException(`Parent with ID ${parentId} not found`);
    }

    // Basic integrity checks
    if (!childrenIds || childrenIds.length === 0) {
      throw new BadRequestException('childrenIds is required');
    }

    if (childrenIds.includes(parentId)) {
      throw new BadRequestException('A person cannot be their own parent');
    }

    // Prevent cycles: the child cannot be an ancestor of the chosen parent.
    // Example cycle: child -> ... -> parent, and then parent becomes child's parent.
    for (const childId of childrenIds) {
      const wouldCycle = await this.wouldCreateAncestryCycle(childId, parentId);
      if (wouldCycle) {
        throw new BadRequestException(
          `Cannot link parent ${parentId} to child ${childId}: it would create a cycle`,
        );
      }
    }

    // Validate parent gender matches parent type
    const expectedGender = parentType === 'father' ? 'male' : 'female';
    if (parent.gender !== expectedGender) {
      throw new BadRequestException(
        `Person with ID ${parentId} is ${parent.gender}, cannot be a ${parentType}`,
      );
    }

    // Validate children
    const children = await this.validateChildren(
      childrenIds,
      parent.gender,
      parent.birthDate,
      parent.deathDate,
    );

    // Link children to parent
    await this.linkChildrenToParentInternal(parent, children);

    return {
      message: `Successfully linked ${children.length} children to ${parent.firstName} ${parent.lastName}`,
      updated: children.length,
    };
  }

  /**
   * Validates that persons are connected to the tree.
   * A person must have at least one of:
   * - A parent (connected upward)
   * - Children (connected downward - for adding unknown ancestors)
   * - Be the progenitor (root ancestor)
   */
  private async validateNotOrphan(
    createPersonDto: CreatePersonDto,
  ): Promise<void> {
    const hasParent = createPersonDto.fatherId || createPersonDto.motherId;
    const hasChildren =
      createPersonDto.childrenIds && createPersonDto.childrenIds.length > 0;

    // If person has a parent or children, they're connected to the tree
    if (hasParent || hasChildren) return;

    // If explicitly set as progenitor, allow no connections
    if (createPersonDto.progenitor) return;

    // Check if this is the first person in the tree
    const existingCount = await this.personRepository.count();

    if (existingCount === 0) {
      // First person - auto-set as progenitor
      createPersonDto.progenitor = true;
      return;
    }

    // Not first person and no connections - reject
    throw new BadRequestException(
      'A person must have at least one parent or child to be connected to the tree',
    );
  }

  /**
   * Validates that parent IDs exist and have correct gender
   */
  private async validateParents(
    fatherId?: number,
    motherId?: number,
  ): Promise<void> {
    if (fatherId) {
      const father = await this.personRepository.findOneBy({ id: fatherId });

      if (!father) {
        throw new NotFoundException(`Father with ID ${fatherId} not found`);
      }

      if (father.gender !== 'male') {
        throw new BadRequestException(
          `Person with ID ${fatherId} is not male and cannot be a father`,
        );
      }
    }

    if (motherId) {
      const mother = await this.personRepository.findOneBy({ id: motherId });

      if (!mother) {
        throw new NotFoundException(`Mother with ID ${motherId} not found`);
      }

      if (mother.gender !== 'female') {
        throw new BadRequestException(
          `Person with ID ${motherId} is not female and cannot be a mother`,
        );
      }
    }
  }

  /**
   * Helper functions for partial date handling
   */
  private extractYear(dateString: string): number {
    return parseInt(dateString.split('-')[0], 10);
  }

  private isFullDate(dateString: string): boolean {
    return dateString.split('-').length === 3;
  }

  private isYearOnly(dateString: string): boolean {
    return dateString.split('-').length === 1;
  }

  private async validateParentDates(
    childBirthDate: string | undefined,
    fatherId?: number,
    motherId?: number,
  ): Promise<void> {
    // If no birth date provided, skip validation
    if (!childBirthDate) {
      return;
    }

    const childBirthYear = this.extractYear(childBirthDate);

    if (fatherId) {
      const father = await this.personRepository.findOneBy({ id: fatherId });

      // Father should exist (already validated in validateParents)
      if (father && father.birthDate) {
        const fatherBirthYear = this.extractYear(father.birthDate);

        // Father must be born before child (compare years)
        if (fatherBirthYear >= childBirthYear) {
          throw new BadRequestException(
            `Father (born ${father.birthDate}) cannot be born in or after the same year as child (born ${childBirthDate})`,
          );
        }

        // Minimum age check (14 years)
        const minParentAge = 14;
        const yearsDiff = childBirthYear - fatherBirthYear;

        if (yearsDiff < minParentAge) {
          throw new BadRequestException(
            `Father must be at least ${minParentAge} years old when child is born`,
          );
        }
      }

      // Father death validation with partial date support
      if (father && father.deathDate) {
        const fatherDeathYear = this.extractYear(father.deathDate);

        if (this.isYearOnly(father.deathDate)) {
          // Year-only death: Allow same year + 1 year buffer (conception window)
          if (childBirthYear > fatherDeathYear + 1) {
            throw new BadRequestException(
              `Father died in ${father.deathDate}, too early for child born in ${childBirthDate} (more than 1 year later)`,
            );
          }
        } else if (
          this.isFullDate(father.deathDate) &&
          this.isFullDate(childBirthDate)
        ) {
          // Full dates: Apply 9-month conception rule
          const fatherDeath = new Date(father.deathDate);
          const childBirth = new Date(childBirthDate);
          const nineMonthsAfterDeath = new Date(fatherDeath);
          nineMonthsAfterDeath.setMonth(nineMonthsAfterDeath.getMonth() + 9);

          if (childBirth > nineMonthsAfterDeath) {
            throw new BadRequestException(
              `Father died on ${father.deathDate}, too early for child born on ${childBirthDate} (more than 9 months)`,
            );
          }
        } else {
          // Mixed precision: Be lenient, use 1-year buffer
          if (childBirthYear > fatherDeathYear + 1) {
            throw new BadRequestException(
              `Father died around ${father.deathDate}, too early for child born around ${childBirthDate}`,
            );
          }
        }
      }
    }

    // Validate mother's birth date
    if (motherId) {
      const mother = await this.personRepository.findOneBy({ id: motherId });

      // Mother should exist (already validated in validateParents)
      if (mother && mother.birthDate) {
        const motherBirthYear = this.extractYear(mother.birthDate);

        // Mother must be born before child (compare years)
        if (motherBirthYear >= childBirthYear) {
          throw new BadRequestException(
            `Mother (born ${mother.birthDate}) cannot be born in or after the same year as child (born ${childBirthDate})`,
          );
        }

        // Minimum age check (14 years)
        const minParentAge = 14;
        const yearsDiff = childBirthYear - motherBirthYear;

        if (yearsDiff < minParentAge) {
          throw new BadRequestException(
            `Mother must be at least ${minParentAge} years old when child is born`,
          );
        }
      }

      // Mother death validation with partial date support
      if (mother && mother.deathDate) {
        const motherDeathYear = this.extractYear(mother.deathDate);

        if (this.isYearOnly(mother.deathDate)) {
          // Year-only death: Allow same year (childbirth death)
          if (childBirthYear > motherDeathYear) {
            throw new BadRequestException(
              `Mother died in ${mother.deathDate}, before child was born in ${childBirthDate}`,
            );
          }
        } else if (
          this.isFullDate(mother.deathDate) &&
          this.isFullDate(childBirthDate)
        ) {
          // Full dates: Mother must die on or after child birth
          const motherDeath = new Date(mother.deathDate);
          const childBirth = new Date(childBirthDate);

          if (motherDeath < childBirth) {
            throw new BadRequestException(
              `Mother died on ${mother.deathDate}, before child was born on ${childBirthDate}`,
            );
          }
        } else {
          // Mixed precision: Allow same year
          if (childBirthYear > motherDeathYear) {
            throw new BadRequestException(
              `Mother died around ${mother.deathDate}, before child was born around ${childBirthDate}`,
            );
          }
        }
      }
    }
  }

  async findAllPersons(): Promise<Person[]> {
    return await this.personRepository.find();
  }

  async findPersonById(id: string): Promise<Person> {
    const person = await this.personRepository.findOneBy({ id: Number(id) });
    if (!person) {
      throw new NotFoundException(`Person with ID ${id} not found`);
    }
    return person;
  }

  async findPersonByName(name: string): Promise<Person[]> {
    const searchTerm = `%${name}%`;
    return await this.personRepository
      .createQueryBuilder('person')
      .where('person.firstName LIKE :searchTerm', { searchTerm })
      .orWhere('person.lastName LIKE :searchTerm', { searchTerm })
      .orWhere("person.firstName || ' ' || person.lastName LIKE :searchTerm", {
        search: searchTerm,
      })
      .getMany();
  }

  async removePerson(id: string): Promise<{ message: string }> {
    const person = await this.findPersonById(id);

    const children = await this.personRepository.find({
      where: [{ fatherId: person.id }, { motherId: person.id }],
    });

    if (children.length > 0) {
      throw new BadRequestException(
        `Cannot delete person with ID ${id}. This person has ${children.length} child(ren). Delete children first or remove parent references.`,
      );
    }

    const fullName = `${person.firstName} ${person.lastName}`;

    await this.personRepository.remove(person);
    return { message: `Person ${fullName} deleted successfully` };
  }

  async updatePerson(
    id: string,
    updatePersonDto: UpdatePersonDto,
  ): Promise<Person> {
    const person = await this.findPersonById(id);

    // no need for check !person as findPersonById will throw if not found

    // Validate parents if being updated
    if (updatePersonDto.fatherId || updatePersonDto.motherId) {
      await this.validateParents(
        updatePersonDto.fatherId,
        updatePersonDto.motherId,
      );
    }

    // Validate dates if birthDate OR parents are being updated
    if (
      updatePersonDto.birthDate ||
      updatePersonDto.fatherId ||
      updatePersonDto.motherId
    ) {
      await this.validateParentDates(
        updatePersonDto.birthDate ?? person.birthDate,
        updatePersonDto.fatherId ?? person.fatherId,
        updatePersonDto.motherId ?? person.motherId,
      );
    }

    if (
      updatePersonDto.fatherId === Number(id) ||
      updatePersonDto.motherId === Number(id)
    ) {
      throw new BadRequestException('A person cannot be their own parent');
    }

    // Prevent cycles when setting parents via update
    if (updatePersonDto.fatherId != null) {
      const wouldCycle = await this.wouldCreateAncestryCycle(
        person.id,
        updatePersonDto.fatherId,
      );
      if (wouldCycle) {
        throw new BadRequestException(
          `Cannot set fatherId to ${updatePersonDto.fatherId}: it would create a cycle`,
        );
      }
    }

    if (updatePersonDto.motherId != null) {
      const wouldCycle = await this.wouldCreateAncestryCycle(
        person.id,
        updatePersonDto.motherId,
      );
      if (wouldCycle) {
        throw new BadRequestException(
          `Cannot set motherId to ${updatePersonDto.motherId}: it would create a cycle`,
        );
      }
    }

    Object.assign(person, updatePersonDto);
    return this.personRepository.save(person);
  }

  async findProgenitor(): Promise<Person | null> {
    return await this.personRepository.findOneBy({ progenitor: true });
  }

  async promoteAncestor(dto: PromoteAncestorDto): Promise<Person> {
    const currentProgenitor = await this.findProgenitor();
    if (!currentProgenitor) {
      throw new NotFoundException('No progenitor exists in the family tree');
    }

    if (currentProgenitor.id !== dto.currentProgenitorId) {
      throw new BadRequestException(
        `Person ID ${dto.currentProgenitorId} is not the current progenitor. ` +
          `Actual progenitor is ${currentProgenitor.firstName} ${currentProgenitor.lastName} (ID: ${currentProgenitor.id})`,
      );
    }

    const expectedGender = dto.relationship === 'father' ? 'male' : 'female';

    if (dto.gender !== expectedGender) {
      throw new BadRequestException(
        `New ${dto.relationship} must be ${expectedGender}, not ${dto.gender}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { currentProgenitorId, relationship, ...personData } = dto;

      const newAncestor = queryRunner.manager.create(Person, {
        ...personData,
        progenitor: true,
      });
      await queryRunner.manager.save(newAncestor);

      //update old progenitor to non-progenitor and set new parent link
      const parentField = relationship === 'father' ? 'fatherId' : 'motherId';
      await queryRunner.manager.update(Person, currentProgenitorId, {
        progenitor: false,
        [parentField]: newAncestor.id,
      });

      await queryRunner.commitTransaction();

      return newAncestor;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // cleanup important always
      await queryRunner.release();
    }
  }
}
