import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { TreesService } from '../trees/trees.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TREE_ID = 'tree-uuid-1';
const OWNER_ID = 'owner-uuid-1';

function makeOwnerReq(treeId = TREE_ID) {
  return {
    user: { type: 'owner' as const, userId: OWNER_ID, email: 'a@b.com' },
    headers: { 'x-tree-id': treeId },
  };
}

function makeGuestReq(treeId = TREE_ID) {
  return {
    user: { type: 'guest' as const, treeId, treeName: 'Test Tree' },
    headers: {},
  };
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPersonsService = {
  create: jest.fn(),
  findAllPersons: jest.fn(),
  findPersonByName: jest.fn(),
  findPersonById: jest.fn(),
  findProgenitor: jest.fn(),
  removePerson: jest.fn(),
  updatePerson: jest.fn(),
  promoteAncestor: jest.fn(),
  deleteOrphanedPersons: jest.fn(),
  linkChildrenToParent: jest.fn(),
  getPartnerships: jest.fn(),
  getPartnership: jest.fn(),
  upsertPartnership: jest.fn(),
};

const mockTreesService = {
  findById: jest.fn(),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PersonsController', () => {
  let controller: PersonsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonsController],
      providers: [
        { provide: PersonsService, useValue: mockPersonsService },
        { provide: TreesService, useValue: mockTreesService },
      ],
    }).compile();

    controller = module.get<PersonsController>(PersonsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // resolveTreeId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('resolveTreeId (via endpoints)', () => {
    it('should use treeId from guest JWT', async () => {
      const persons = [{ id: 1, firstName: 'A' }];
      mockPersonsService.findAllPersons.mockResolvedValue(persons);

      const result = await controller.findAllPersons(undefined, makeGuestReq());
      expect(mockPersonsService.findAllPersons).toHaveBeenCalledWith(TREE_ID);
      expect(result).toEqual(persons);
    });

    it('should use X-Tree-Id header for owner JWT', async () => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: OWNER_ID,
      });
      mockPersonsService.findAllPersons.mockResolvedValue([]);

      await controller.findAllPersons(undefined, makeOwnerReq());
      expect(mockTreesService.findById).toHaveBeenCalledWith(TREE_ID);
      expect(mockPersonsService.findAllPersons).toHaveBeenCalledWith(TREE_ID);
    });

    it('should throw ForbiddenException if owner has no X-Tree-Id header', async () => {
      const req = makeOwnerReq();
      req.headers = {};

      await expect(controller.findAllPersons(undefined, req)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if owner does not own tree', async () => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: 'other-owner',
      });

      await expect(
        controller.findAllPersons(undefined, makeOwnerReq()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUD Endpoints
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should delegate to personsService.create', async () => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: OWNER_ID,
      });
      const dto = { firstName: 'New', lastName: 'Person', gender: 'male' };
      const created = { id: 1, ...dto };
      mockPersonsService.create.mockResolvedValue(created);

      const result = await controller.create(dto as any, makeOwnerReq());
      expect(result).toEqual(created);
      expect(mockPersonsService.create).toHaveBeenCalledWith(dto, TREE_ID);
    });
  });

  describe('findAllPersons', () => {
    it('should search by name when query param provided', async () => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: OWNER_ID,
      });
      mockPersonsService.findPersonByName.mockResolvedValue([
        { id: 1, firstName: 'John' },
      ]);

      const result = await controller.findAllPersons('John', makeOwnerReq());
      expect(mockPersonsService.findPersonByName).toHaveBeenCalledWith(
        'John',
        TREE_ID,
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findPersonById', () => {
    it('should return a single person', async () => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: OWNER_ID,
      });
      const person = { id: 5, firstName: 'Jane' };
      mockPersonsService.findPersonById.mockResolvedValue(person);

      const result = await controller.findPersonById('5', makeOwnerReq());
      expect(result).toEqual(person);
    });
  });

  describe('removePerson', () => {
    it('should delete and return message', async () => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: OWNER_ID,
      });
      mockPersonsService.removePerson.mockResolvedValue({ message: 'Deleted' });

      const result = await controller.removePerson('3', makeOwnerReq());
      expect(result.message).toBe('Deleted');
    });
  });

  describe('updatePerson', () => {
    it('should patch a person', async () => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: OWNER_ID,
      });
      const updated = { id: 1, firstName: 'Updated' };
      mockPersonsService.updatePerson.mockResolvedValue(updated);

      const result = await controller.updatePerson(
        '1',
        { firstName: 'Updated' } as any,
        makeOwnerReq(),
      );
      expect(result.firstName).toBe('Updated');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Partnership Endpoints
  // ═══════════════════════════════════════════════════════════════════════════

  describe('partnerships', () => {
    beforeEach(() => {
      mockTreesService.findById.mockResolvedValue({
        id: TREE_ID,
        ownerId: OWNER_ID,
      });
    });

    it('should return all partnerships', async () => {
      mockPersonsService.getPartnerships.mockResolvedValue([{ id: 1 }]);
      const result = await controller.getPartnerships(makeOwnerReq());
      expect(result).toHaveLength(1);
    });

    it('should return a specific partnership pair', async () => {
      mockPersonsService.getPartnership.mockResolvedValue({
        id: 1,
        person1Id: 1,
        person2Id: 2,
      });
      const result = await controller.getPartnership('1', '2', makeOwnerReq());
      expect(result).toBeDefined();
      expect(mockPersonsService.getPartnership).toHaveBeenCalledWith(
        1,
        2,
        TREE_ID,
      );
    });

    it('should upsert a partnership', async () => {
      const dto = { person1Id: 1, person2Id: 2, marriageDate: '2000-01-01' };
      mockPersonsService.upsertPartnership.mockResolvedValue({ ...dto, id: 1 });

      const result = await controller.upsertPartnership(
        dto as any,
        makeOwnerReq(),
      );
      expect(result.marriageDate).toBe('2000-01-01');
    });
  });
});
