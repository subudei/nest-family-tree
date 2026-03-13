import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TreesService } from './trees.service';
import { Tree } from './tree.entity';

// ─── Helpers ────────────────────────────────────────────────────────────────

const OWNER_ID = 'owner-uuid-1';

function makeTree(overrides: Partial<any> = {}): Tree {
  return {
    id: 'tree-uuid-1',
    name: 'Test Tree',
    guestUsername: 'testguest',
    guestPasswordHash: '$2b$10$hashedpassword',
    ownerId: OWNER_ID,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Tree;
}

// ─── Mock Factory ───────────────────────────────────────────────────────────

type MockRepository<T extends object = any> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

function createMockRepository(): MockRepository {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('TreesService', () => {
  let service: TreesService;
  let treeRepo: MockRepository;

  beforeEach(async () => {
    treeRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreesService,
        { provide: getRepositoryToken(Tree), useValue: treeRepo },
      ],
    }).compile();

    service = module.get<TreesService>(TreesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findById
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findById', () => {
    it('should return a tree by id', async () => {
      const tree = makeTree();
      treeRepo.findOne!.mockResolvedValue(tree);

      const result = await service.findById('tree-uuid-1');

      expect(result).toEqual(tree);
      expect(treeRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'tree-uuid-1' },
      });
    });

    it('should return null if tree not found', async () => {
      treeRepo.findOne!.mockResolvedValue(null);

      const result = await service.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findByGuestUsername
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findByGuestUsername', () => {
    it('should return a tree by guest username', async () => {
      const tree = makeTree();
      treeRepo.findOne!.mockResolvedValue(tree);

      const result = await service.findByGuestUsername('testguest');

      expect(result).toEqual(tree);
      expect(treeRepo.findOne).toHaveBeenCalledWith({
        where: { guestUsername: 'testguest' },
      });
    });

    it('should return null if guest username not found', async () => {
      treeRepo.findOne!.mockResolvedValue(null);

      const result = await service.findByGuestUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findAllByOwner
  // ═══════════════════════════════════════════════════════════════════════════

  describe('findAllByOwner', () => {
    it('should return all trees for an owner', async () => {
      const trees = [
        makeTree({ id: 'tree-1', name: 'Tree One' }),
        makeTree({ id: 'tree-2', name: 'Tree Two' }),
      ];
      treeRepo.find!.mockResolvedValue(trees);

      const result = await service.findAllByOwner(OWNER_ID);

      expect(result).toHaveLength(2);
      expect(treeRepo.find).toHaveBeenCalledWith({
        where: { ownerId: OWNER_ID },
      });
    });

    it('should return empty array if owner has no trees', async () => {
      treeRepo.find!.mockResolvedValue([]);

      const result = await service.findAllByOwner(OWNER_ID);

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // isGuestUsernameTaken
  // ═══════════════════════════════════════════════════════════════════════════

  describe('isGuestUsernameTaken', () => {
    it('should return true if guest username exists', async () => {
      treeRepo.findOne!.mockResolvedValue(makeTree());

      const result = await service.isGuestUsernameTaken('testguest');

      expect(result).toBe(true);
    });

    it('should return false if guest username does not exist', async () => {
      treeRepo.findOne!.mockResolvedValue(null);

      const result = await service.isGuestUsernameTaken('newguest');

      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // create
  // ═══════════════════════════════════════════════════════════════════════════

  describe('create', () => {
    it('should create and save a new tree', async () => {
      const treeData = {
        name: 'New Tree',
        ownerId: OWNER_ID,
        guestUsername: 'newguest',
        guestPasswordHash: '$2b$10$hashed',
      };
      const createdTree = makeTree(treeData);

      treeRepo.create!.mockReturnValue(createdTree);
      treeRepo.save!.mockResolvedValue(createdTree);

      const result = await service.create(treeData);

      expect(treeRepo.create).toHaveBeenCalledWith(treeData);
      expect(treeRepo.save).toHaveBeenCalledWith(createdTree);
      expect(result.name).toBe('New Tree');
      expect(result.guestUsername).toBe('newguest');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // update
  // ═══════════════════════════════════════════════════════════════════════════

  describe('update', () => {
    it('should update a tree and return the updated entity', async () => {
      const updatedTree = makeTree({ name: 'Renamed Tree' });
      treeRepo.update!.mockResolvedValue({ affected: 1 });
      treeRepo.findOne!.mockResolvedValue(updatedTree);

      const result = await service.update('tree-uuid-1', {
        name: 'Renamed Tree',
      });

      expect(treeRepo.update).toHaveBeenCalledWith('tree-uuid-1', {
        name: 'Renamed Tree',
      });
      expect(result).toEqual(updatedTree);
    });

    it('should return null if tree does not exist after update', async () => {
      treeRepo.update!.mockResolvedValue({ affected: 0 });
      treeRepo.findOne!.mockResolvedValue(null);

      const result = await service.update('nonexistent', { name: 'Test' });

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // delete
  // ═══════════════════════════════════════════════════════════════════════════

  describe('delete', () => {
    it('should delete a tree by id', async () => {
      treeRepo.delete!.mockResolvedValue({ affected: 1 });

      await service.delete('tree-uuid-1');

      expect(treeRepo.delete).toHaveBeenCalledWith('tree-uuid-1');
    });

    it('should not throw if tree does not exist', async () => {
      treeRepo.delete!.mockResolvedValue({ affected: 0 });

      await expect(service.delete('nonexistent')).resolves.not.toThrow();
    });
  });
});
