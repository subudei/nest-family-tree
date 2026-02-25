import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PersonsService } from './persons.service';
import { Person } from './person.entity';
import { Partnership } from './partnership.entity';
import { CreatePersonDto } from './dtos/create-person.dto';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TREE_ID = 'tree-uuid-1';

/** Minimal Person factory – override any field you need. */
function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: 1,
    treeId: TREE_ID,
    firstName: 'John',
    lastName: 'Doe',
    gender: 'male',
    progenitor: false,
    deceased: false,
    fatherId: undefined,
    motherId: undefined,
    birthDate: undefined,
    deathDate: undefined,
    trivia: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Person;
}

// ─── Mock Factories ─────────────────────────────────────────────────────────

type MockRepository<T extends object = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function createMockRepository(): MockRepository {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

function createMockDataSource() {
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    },
  };
  return {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    _queryRunner: mockQueryRunner,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PersonsService', () => {
  let service: PersonsService;
  let personRepo: MockRepository;
  let partnershipRepo: MockRepository;
  let dataSource: ReturnType<typeof createMockDataSource>;

  beforeEach(async () => {
    personRepo = createMockRepository();
    partnershipRepo = createMockRepository();
    dataSource = createMockDataSource();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PersonsService,
        { provide: getRepositoryToken(Person), useValue: personRepo },
        { provide: getRepositoryToken(Partnership), useValue: partnershipRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<PersonsService>(PersonsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should create the first person in a tree and auto-set progenitor', async () => {
      const dto: CreatePersonDto = {
        firstName: 'Adam',
        lastName: 'First',
        gender: 'male',
      };

      personRepo.count!.mockResolvedValue(0); // empty tree
      personRepo.create!.mockReturnValue({
        ...dto,
        treeId: TREE_ID,
        progenitor: true,
        id: 1,
      });
      personRepo.save!.mockImplementation((p) =>
        Promise.resolve({ ...p, id: 1 }),
      );

      const result = await service.create(dto, TREE_ID);

      expect(result.id).toBe(1);
      expect(personRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'Adam', treeId: TREE_ID }),
      );
      expect(personRepo.save).toHaveBeenCalled();
    });

    it('should reject an orphan (no parents, no children, not progenitor)', async () => {
      const dto: CreatePersonDto = {
        firstName: 'Orphan',
        lastName: 'Nobody',
        gender: 'male',
      };

      personRepo.count!.mockResolvedValue(5); // tree already has people

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create a child with a valid father', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1960-01-01',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'female',
        fatherId: 1,
        birthDate: '1990-01-01',
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return father;
        return null;
      });
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 2 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Child');
    });

    it('should reject father with wrong gender', async () => {
      const femalePerson = makePerson({ id: 1, gender: 'female' });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(femalePerson);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject mother with wrong gender', async () => {
      const malePerson = makePerson({ id: 2, gender: 'male' });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'female',
        motherId: 2,
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(malePerson);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject non-existent father', async () => {
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 999,
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(null);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BIRTH DATE VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('birth date validation', () => {
    it('should reject child born before father', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1990-01-01',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1985-01-01',
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(father);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject father younger than 14 at child birth', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1990-01-01',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'female',
        fatherId: 1,
        birthDate: '2000-01-01', // father would be 10
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(father);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(/at least 14/);
    });

    it('should allow father who is exactly 14 years older', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1976-01-01',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1990-01-01', // father is 14
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return father;
        return null;
      });
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 2 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Child');
    });

    it('should reject child born >9 months after father death (full dates)', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1950-01-01',
        deathDate: '1980-01-01',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1981-06-01', // >9 months after father death
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(father);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow child born within 9 months after father death (full dates)', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1950-01-01',
        deathDate: '1980-06-01',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1981-01-01', // ~7 months after death — within 9 month window
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return father;
        return null;
      });
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 2 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Child');
    });

    it('should reject child born after mother death', async () => {
      const mother = makePerson({
        id: 2,
        gender: 'female',
        birthDate: '1950-01-01',
        deathDate: '1980-01-01',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        motherId: 2,
        birthDate: '1981-01-01',
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(mother);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle year-only father death (1-year buffer)', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1950',
        deathDate: '1980',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1982', // 2 years after death year — should fail
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(father);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow father death year + 1 with year-only dates', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1950',
        deathDate: '1980',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1981', // death year + 1 — within buffer
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return father;
        return null;
      });
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 2 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Child');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FIND
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findAllPersons', () => {
    it('should return all persons for a tree', async () => {
      const persons = [makePerson({ id: 1 }), makePerson({ id: 2 })];
      personRepo.find!.mockResolvedValue(persons);

      const result = await service.findAllPersons(TREE_ID);
      expect(result).toHaveLength(2);
      expect(personRepo.find).toHaveBeenCalledWith({
        where: { treeId: TREE_ID },
      });
    });
  });

  describe('findPersonById', () => {
    it('should find a person by id and treeId', async () => {
      const person = makePerson({ id: 5 });
      personRepo.findOneBy!.mockResolvedValue(person);

      const result = await service.findPersonById('5', TREE_ID);
      expect(result.id).toBe(5);
    });

    it('should throw NotFoundException if person not found', async () => {
      personRepo.findOneBy!.mockResolvedValue(null);

      await expect(service.findPersonById('999', TREE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findProgenitor', () => {
    it('should find the progenitor', async () => {
      const progenitor = makePerson({ id: 1, progenitor: true });
      personRepo.findOneBy!.mockResolvedValue(progenitor);

      const result = await service.findProgenitor(TREE_ID);
      expect(result!.progenitor).toBe(true);
    });

    it('should return null if no progenitor', async () => {
      personRepo.findOneBy!.mockResolvedValue(null);

      const result = await service.findProgenitor(TREE_ID);
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('removePerson', () => {
    it('should delete a person with no children', async () => {
      const person = makePerson({
        id: 3,
        firstName: 'Jack',
        lastName: 'Smith',
      });
      personRepo.findOneBy!.mockResolvedValue(person);
      personRepo.find!.mockResolvedValue([]); // no children
      personRepo.remove!.mockResolvedValue(person);

      const result = await service.removePerson('3', TREE_ID);
      expect(result.message).toContain('Jack Smith');
      expect(personRepo.remove).toHaveBeenCalledWith(person);
    });

    it('should reject deleting a person who has children', async () => {
      const person = makePerson({ id: 3 });
      const child = makePerson({ id: 4, fatherId: 3 });

      personRepo.findOneBy!.mockResolvedValue(person);
      personRepo.find!.mockResolvedValue([child]);

      await expect(service.removePerson('3', TREE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updatePerson', () => {
    it('should update first and last name', async () => {
      const person = makePerson({ id: 1, firstName: 'John', lastName: 'Doe' });
      personRepo.findOneBy!.mockResolvedValue(person);
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));
      // No children for orphan cleanup
      personRepo.count!.mockResolvedValue(0);
      personRepo.find!.mockResolvedValue([]);

      const result = await service.updatePerson(
        '1',
        { firstName: 'Jane', lastName: 'Smith' },
        TREE_ID,
      );
      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Smith');
    });

    it('should reject setting self as own parent', async () => {
      const person = makePerson({ id: 5 });
      personRepo.findOneBy!.mockResolvedValue(person);

      await expect(
        service.updatePerson('5', { fatherId: 5 }, TREE_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject setting a female person as father', async () => {
      const person = makePerson({ id: 1 });
      const female = makePerson({ id: 2, gender: 'female' });

      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return person;
        if (where.id === 2) return female;
        return null;
      });

      await expect(
        service.updatePerson('1', { fatherId: 2 }, TREE_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROMOTE ANCESTOR
  // ═══════════════════════════════════════════════════════════════════════════

  describe('promoteAncestor', () => {
    it('should promote a new male ancestor as father', async () => {
      const currentProgenitor = makePerson({
        id: 1,
        progenitor: true,
        firstName: 'Current',
      });
      personRepo.findOneBy!.mockResolvedValue(currentProgenitor);

      const qr = dataSource._queryRunner;
      qr.manager.create.mockReturnValue({
        id: 99,
        firstName: 'Grandpa',
        lastName: 'Doe',
        gender: 'male',
        progenitor: true,
        treeId: TREE_ID,
      });
      qr.manager.save.mockImplementation((p) => Promise.resolve(p));
      qr.manager.update.mockResolvedValue(undefined);

      const result = await service.promoteAncestor(
        {
          firstName: 'Grandpa',
          lastName: 'Doe',
          gender: 'male',
          currentProgenitorId: 1,
          relationship: 'father',
        },
        TREE_ID,
      );

      expect(result.firstName).toBe('Grandpa');
      expect(result.progenitor).toBe(true);
      expect(qr.manager.update).toHaveBeenCalledWith(Person, 1, {
        progenitor: false,
        fatherId: 99,
      });
      expect(qr.commitTransaction).toHaveBeenCalled();
    });

    it('should promote a new female ancestor as mother', async () => {
      const currentProgenitor = makePerson({ id: 1, progenitor: true });
      personRepo.findOneBy!.mockResolvedValue(currentProgenitor);

      const qr = dataSource._queryRunner;
      qr.manager.create.mockReturnValue({
        id: 100,
        firstName: 'Grandma',
        lastName: 'Doe',
        gender: 'female',
        progenitor: true,
        treeId: TREE_ID,
      });
      qr.manager.save.mockImplementation((p) => Promise.resolve(p));
      qr.manager.update.mockResolvedValue(undefined);

      const result = await service.promoteAncestor(
        {
          firstName: 'Grandma',
          lastName: 'Doe',
          gender: 'female',
          currentProgenitorId: 1,
          relationship: 'mother',
        },
        TREE_ID,
      );

      expect(result.firstName).toBe('Grandma');
      expect(qr.manager.update).toHaveBeenCalledWith(Person, 1, {
        progenitor: false,
        motherId: 100,
      });
    });

    it('should reject mismatched gender and relationship', async () => {
      const currentProgenitor = makePerson({ id: 1, progenitor: true });
      personRepo.findOneBy!.mockResolvedValue(currentProgenitor);

      await expect(
        service.promoteAncestor(
          {
            firstName: 'Wrong',
            lastName: 'Gender',
            gender: 'female', // female as father
            currentProgenitorId: 1,
            relationship: 'father',
          },
          TREE_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if currentProgenitorId does not match actual progenitor', async () => {
      const currentProgenitor = makePerson({ id: 1, progenitor: true });
      personRepo.findOneBy!.mockResolvedValue(currentProgenitor);

      await expect(
        service.promoteAncestor(
          {
            firstName: 'New',
            lastName: 'Ancestor',
            gender: 'male',
            currentProgenitorId: 999,
            relationship: 'father',
          },
          TREE_ID,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if no progenitor exists', async () => {
      personRepo.findOneBy!.mockResolvedValue(null);

      await expect(
        service.promoteAncestor(
          {
            firstName: 'New',
            lastName: 'Ancestor',
            gender: 'male',
            currentProgenitorId: 1,
            relationship: 'father',
          },
          TREE_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should rollback transaction on error', async () => {
      const currentProgenitor = makePerson({ id: 1, progenitor: true });
      personRepo.findOneBy!.mockResolvedValue(currentProgenitor);

      const qr = dataSource._queryRunner;
      qr.manager.create.mockReturnValue({ id: 99 });
      qr.manager.save.mockRejectedValue(new Error('DB error'));

      await expect(
        service.promoteAncestor(
          {
            firstName: 'New',
            lastName: 'Ancestor',
            gender: 'male',
            currentProgenitorId: 1,
            relationship: 'father',
          },
          TREE_ID,
        ),
      ).rejects.toThrow('DB error');

      expect(qr.rollbackTransaction).toHaveBeenCalled();
      expect(qr.release).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LINK CHILDREN TO PARENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('linkChildrenToParent', () => {
    it('should link children to a father', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1960-01-01',
      });
      const child1 = makePerson({
        id: 2,
        birthDate: '1990-01-01',
        fatherId: undefined,
      });
      const child2 = makePerson({
        id: 3,
        birthDate: '1992-01-01',
        fatherId: undefined,
      });

      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return father;
        return null;
      });
      personRepo.findBy!.mockResolvedValue([child1, child2]);
      personRepo.update!.mockResolvedValue(undefined);

      const result = await service.linkChildrenToParent(
        1,
        [2, 3],
        'father',
        TREE_ID,
      );
      expect(result.updated).toBe(2);
      expect(personRepo.update).toHaveBeenCalledTimes(2);
    });

    it('should reject linking a person as their own parent', async () => {
      const person = makePerson({ id: 5, gender: 'male' });
      personRepo.findOneBy!.mockResolvedValue(person);

      await expect(
        service.linkChildrenToParent(5, [5], 'father', TREE_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject gender mismatch (female as father)', async () => {
      const female = makePerson({ id: 1, gender: 'female' });
      personRepo.findOneBy!.mockResolvedValue(female);

      await expect(
        service.linkChildrenToParent(1, [2], 'father', TREE_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty childrenIds', async () => {
      const father = makePerson({ id: 1, gender: 'male' });
      personRepo.findOneBy!.mockResolvedValue(father);

      await expect(
        service.linkChildrenToParent(1, [], 'father', TREE_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if parent not found', async () => {
      personRepo.findOneBy!.mockResolvedValue(null);

      await expect(
        service.linkChildrenToParent(999, [2], 'father', TREE_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE ORPHANED PERSONS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deleteOrphanedPersons', () => {
    it('should delete persons not connected to progenitor', async () => {
      const progenitor = makePerson({ id: 1, progenitor: true });
      const connected = makePerson({ id: 2, fatherId: 1 });
      const orphan = makePerson({ id: 3 }); // no parent links, not progenitor

      personRepo.find!.mockResolvedValue([progenitor, connected, orphan]);
      personRepo.delete!.mockResolvedValue({ affected: 1 });

      const result = await service.deleteOrphanedPersons(TREE_ID);
      expect(result.deleted).toBe(1);
      expect(personRepo.delete).toHaveBeenCalledWith([3]);
    });

    it('should return 0 deleted if no orphans', async () => {
      const progenitor = makePerson({ id: 1, progenitor: true });
      const child = makePerson({ id: 2, fatherId: 1 });

      personRepo.find!.mockResolvedValue([progenitor, child]);

      const result = await service.deleteOrphanedPersons(TREE_ID);
      expect(result.deleted).toBe(0);
    });

    it('should handle tree with no progenitor', async () => {
      personRepo.find!.mockResolvedValue([
        makePerson({ id: 1, progenitor: false }),
      ]);

      const result = await service.deleteOrphanedPersons(TREE_ID);
      expect(result.deleted).toBe(0);
      expect(result.message).toContain('No progenitor');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CHILDREN VALIDATION (via create with childrenIds)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validateChildren (via create)', () => {
    it('should reject if child already has a parent of that gender', async () => {
      const childWithFather = makePerson({
        id: 2,
        fatherId: 99,
        birthDate: '2000-01-01',
      });
      const dto: CreatePersonDto = {
        firstName: 'NewDad',
        lastName: 'Doe',
        gender: 'male',
        birthDate: '1970-01-01',
        progenitor: true,
        childrenIds: [2],
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findBy!.mockResolvedValue([childWithFather]);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        /already has a father/,
      );
    });

    it('should reject if childrenIds refers to nonexistent persons', async () => {
      const dto: CreatePersonDto = {
        firstName: 'NewDad',
        lastName: 'Doe',
        gender: 'male',
        progenitor: true,
        childrenIds: [100, 101],
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findBy!.mockResolvedValue([makePerson({ id: 100 })]); // only 1 found of 2

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(/not found/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTNERSHIPS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('partnerships', () => {
    it('should return all partnerships for a tree', async () => {
      const partnerships = [
        { id: 1, person1Id: 1, person2Id: 2, treeId: TREE_ID },
      ];
      partnershipRepo.find!.mockResolvedValue(partnerships);

      const result = await service.getPartnerships(TREE_ID);
      expect(result).toHaveLength(1);
    });

    it('should find partnership in either person order', async () => {
      const partnership = { id: 1, person1Id: 1, person2Id: 2 };
      partnershipRepo.findOne!.mockResolvedValue(partnership);

      const result = await service.getPartnership(2, 1, TREE_ID);
      expect(result).toBeDefined();
    });

    it('should create new partnership if none exists', async () => {
      partnershipRepo.findOne!.mockResolvedValue(null); // no existing
      partnershipRepo.create!.mockImplementation((data) => ({
        ...data,
        id: 1,
      }));
      partnershipRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.upsertPartnership(
        { person1Id: 1, person2Id: 2, marriageDate: '2000-06-15' },
        TREE_ID,
      );

      expect(result.marriageDate).toBe('2000-06-15');
      expect(partnershipRepo.create).toHaveBeenCalled();
    });

    it('should update existing partnership', async () => {
      const existing = {
        id: 1,
        person1Id: 1,
        person2Id: 2,
        marriageDate: '2000-01-01',
        divorced: false,
        treeId: TREE_ID,
      };
      partnershipRepo.findOne!.mockResolvedValue(existing);
      partnershipRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.upsertPartnership(
        {
          person1Id: 1,
          person2Id: 2,
          divorced: true,
          divorceDate: '2010-06-01',
        },
        TREE_ID,
      );

      expect(result.divorced).toBe(true);
      expect(result.divorceDate).toBe('2010-06-01');
      expect(partnershipRepo.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STUPID-USER PROTECTION (max age, implicit lifespan, year range)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('max parent age validation', () => {
    it('should reject father who would be >120 years old at child birth', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '800',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1100', // father would be 300 years old
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(father);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        /maximum.*120|maximum allowed/,
      );
    });

    it('should reject mother who would be >70 years old at child birth', async () => {
      const mother = makePerson({
        id: 2,
        gender: 'female',
        birthDate: '1920',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'female',
        motherId: 2,
        birthDate: '1995', // mother would be 75 years old
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(mother);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        /maximum.*70|maximum allowed/,
      );
    });

    it('should allow father at age 119 (within limit)', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1800',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        fatherId: 1,
        birthDate: '1919', // father would be 119
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return father;
        return null;
      });
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 2 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Child');
    });

    it('should allow mother at age 69 (within limit)', async () => {
      const mother = makePerson({
        id: 2,
        gender: 'female',
        birthDate: '1920',
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Child',
        lastName: 'Doe',
        gender: 'male',
        motherId: 2,
        birthDate: '1989', // mother would be 69
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 2) return mother;
        return null;
      });
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 3 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Child');
    });
  });

  describe('implicit lifespan validation (no death date)', () => {
    it('should reject father born 800 with child born 1100 (no death date)', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '800',
        deathDate: undefined,
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Late',
        lastName: 'Child',
        gender: 'male',
        fatherId: 1,
        birthDate: '1100',
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockResolvedValue(father);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(/maximum/);
    });

    it('should allow father born 1880 with child born 1920 (no death date)', async () => {
      const father = makePerson({
        id: 1,
        gender: 'male',
        birthDate: '1880',
        deathDate: undefined,
        progenitor: true,
      });
      const dto: CreatePersonDto = {
        firstName: 'Valid',
        lastName: 'Child',
        gender: 'male',
        fatherId: 1,
        birthDate: '1920', // 40 years — within both max-age and lifespan
      };

      personRepo.count!.mockResolvedValue(1);
      personRepo.findOneBy!.mockImplementation((where: any) => {
        if (where.id === 1) return father;
        return null;
      });
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 2 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Valid');
    });
  });

  describe('year range validation', () => {
    it('should reject birth year 0', async () => {
      const dto: CreatePersonDto = {
        firstName: 'BC',
        lastName: 'Person',
        gender: 'male',
        birthDate: '0',
      };

      personRepo.count!.mockResolvedValue(0);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(/at least 1/);
    });

    it('should reject negative birth year', async () => {
      const dto: CreatePersonDto = {
        firstName: 'Ancient',
        lastName: 'Person',
        gender: 'male',
        birthDate: '-500',
      };

      personRepo.count!.mockResolvedValue(0);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(/at least 1/);
    });

    it('should allow birth year 1', async () => {
      const dto: CreatePersonDto = {
        firstName: 'Year1',
        lastName: 'Person',
        gender: 'male',
        birthDate: '1',
      };

      personRepo.count!.mockResolvedValue(0);
      personRepo.create!.mockImplementation((data) => ({ ...data, id: 1 }));
      personRepo.save!.mockImplementation((p) => Promise.resolve(p));

      const result = await service.create(dto, TREE_ID);
      expect(result.firstName).toBe('Year1');
    });

    it('should reject death date year 0', async () => {
      const dto: CreatePersonDto = {
        firstName: 'Bad',
        lastName: 'Death',
        gender: 'male',
        birthDate: '100',
        deathDate: '0',
      };

      personRepo.count!.mockResolvedValue(0);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(/at least 1/);
    });

    it('should reject death before birth on person creation', async () => {
      const dto: CreatePersonDto = {
        firstName: 'TimeTraveler',
        lastName: 'Person',
        gender: 'male',
        birthDate: '1990',
        deathDate: '1980',
      };

      personRepo.count!.mockResolvedValue(0);

      await expect(service.create(dto, TREE_ID)).rejects.toThrow(
        /cannot be before birth/,
      );
    });
  });

  describe('updatePerson year validation', () => {
    it('should reject updating birthDate to year 0', async () => {
      const person = makePerson({ id: 1, birthDate: '1990' });
      personRepo.findOneBy!.mockResolvedValue(person);

      await expect(
        service.updatePerson('1', { birthDate: '0' }, TREE_ID),
      ).rejects.toThrow(/at least 1/);
    });

    it('should reject updating with death before birth', async () => {
      const person = makePerson({
        id: 1,
        birthDate: '1990',
        deathDate: undefined,
      });
      personRepo.findOneBy!.mockResolvedValue(person);

      await expect(
        service.updatePerson('1', { deathDate: '1980' }, TREE_ID),
      ).rejects.toThrow(/cannot be before birth/);
    });
  });
});
