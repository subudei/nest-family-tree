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

  async create(createPersonDto: CreatePersonDto): Promise<Person> {
    // Step 1: Validate parents exist and have correct gender
    await this.validateParents(
      createPersonDto.fatherId,
      createPersonDto.motherId,
    );

    // Step 2: Validate birth dates make sense
    await this.validateParentDates(
      createPersonDto.birthDate,
      createPersonDto.fatherId,
      createPersonDto.motherId,
    );

    // Step 3: Create person
    const newPerson = this.personRepository.create(createPersonDto);
    return await this.personRepository.save(newPerson);
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
