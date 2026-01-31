import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, MoreThanOrEqual } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { SystemAdmin } from './entities/system-admin.entity';
import { Tree } from '../trees/tree.entity';
import { Person } from '../persons/person.entity';
import {
  DashboardStatsDto,
  TreeSummaryDto,
  TreeDetailDto,
  PaginatedResponseDto,
  TreeExportDto,
  PersonSummaryDto,
} from './dtos/dashboard.dto';
import { UpdatePersonAdminDto } from './dtos/update-person-admin.dto';

@Injectable()
export class SystemAdminService {
  private readonly logger = new Logger(SystemAdminService.name);

  constructor(
    @InjectRepository(SystemAdmin)
    private readonly systemAdminRepository: Repository<SystemAdmin>,
    @InjectRepository(Tree)
    private readonly treeRepository: Repository<Tree>,
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
  ) {}

  /**
   * Seed initial system admin from environment variables.
   * Only creates if no system admin with the env username exists.
   */
  async seedFromEnv(): Promise<void> {
    const username = process.env.SYSTEM_ADMIN_USERNAME;
    const password = process.env.SYSTEM_ADMIN_PASSWORD;
    const email = process.env.SYSTEM_ADMIN_EMAIL;
    const displayName =
      process.env.SYSTEM_ADMIN_DISPLAY_NAME || 'System Administrator';

    if (!username || !password) {
      this.logger.warn(
        'SYSTEM_ADMIN_USERNAME or SYSTEM_ADMIN_PASSWORD not set. Skipping seed.',
      );
      return;
    }

    // Check if admin already exists
    const existingAdmin = await this.systemAdminRepository.findOne({
      where: { username },
    });

    if (existingAdmin) {
      this.logger.log(
        `System admin "${username}" already exists. Skipping seed.`,
      );
      return;
    }

    // Create new system admin
    const passwordHash = await bcrypt.hash(password, 10);
    const systemAdmin = this.systemAdminRepository.create({
      username,
      passwordHash,
      email,
      displayName,
      isActive: true,
    });

    await this.systemAdminRepository.save(systemAdmin);
    this.logger.log(`System admin "${username}" created successfully.`);
  }

  /**
   * Find a system admin by username
   */
  async findByUsername(username: string): Promise<SystemAdmin | null> {
    return this.systemAdminRepository.findOne({
      where: { username },
    });
  }

  /**
   * Find a system admin by ID
   */
  async findById(id: string): Promise<SystemAdmin | null> {
    return this.systemAdminRepository.findOne({
      where: { id },
    });
  }

  /**
   * Get all system admins
   */
  async findAll(): Promise<SystemAdmin[]> {
    return this.systemAdminRepository.find({
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Create a new system admin
   */
  async create(data: {
    username: string;
    password: string;
    email?: string;
    displayName?: string;
  }): Promise<SystemAdmin> {
    const passwordHash = await bcrypt.hash(data.password, 10);

    const systemAdmin = this.systemAdminRepository.create({
      username: data.username,
      passwordHash,
      email: data.email,
      displayName: data.displayName || data.username,
      isActive: true,
    });

    return this.systemAdminRepository.save(systemAdmin);
  }

  /**
   * Update a system admin
   */
  async update(
    id: string,
    data: {
      email?: string;
      displayName?: string;
      password?: string;
      isActive?: boolean;
    },
  ): Promise<SystemAdmin | null> {
    const admin = await this.findById(id);
    if (!admin) return null;

    if (data.email !== undefined) admin.email = data.email;
    if (data.displayName !== undefined) admin.displayName = data.displayName;
    if (data.isActive !== undefined) admin.isActive = data.isActive;
    if (data.password) {
      admin.passwordHash = await bcrypt.hash(data.password, 10);
    }

    return this.systemAdminRepository.save(admin);
  }

  /**
   * Deactivate a system admin (soft delete)
   */
  async deactivate(id: string): Promise<boolean> {
    const result = await this.systemAdminRepository.update(id, {
      isActive: false,
    });
    return (result.affected ?? 0) > 0;
  }

  /**
   * Update last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    await this.systemAdminRepository.update(id, {
      lastLoginAt: new Date(),
    });
  }

  /**
   * Validate password for a system admin
   */
  async validatePassword(
    admin: SystemAdmin,
    password: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, admin.passwordHash);
  }

  /**
   * Count total system admins
   */
  async count(): Promise<number> {
    return this.systemAdminRepository.count();
  }

  /**
   * Count active system admins
   */
  async countActive(): Promise<number> {
    return this.systemAdminRepository.count({
      where: { isActive: true },
    });
  }

  // ============================================
  // DASHBOARD & STATISTICS
  // ============================================

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStatsDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalTrees,
      totalPersons,
      totalSystemAdmins,
      treesCreatedThisMonth,
      personsAddedThisMonth,
      recentTreesRaw,
    ] = await Promise.all([
      this.treeRepository.count(),
      this.personRepository.count(),
      this.systemAdminRepository.count(),
      this.treeRepository.count({
        where: { createdAt: MoreThanOrEqual(startOfMonth) },
      }),
      // Note: Person entity doesn't have createdAt, so we can't filter by date
      // We'll return 0 for this or add createdAt to Person entity later
      Promise.resolve(0),
      this.treeRepository.find({
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    // Get person counts for recent trees
    const recentTrees: TreeSummaryDto[] = await Promise.all(
      recentTreesRaw.map(async (tree) => {
        const personCount = await this.personRepository.count({
          where: { treeId: tree.id },
        });
        return {
          id: tree.id,
          name: tree.name,
          adminUsername: tree.adminUsername,
          personCount,
          createdAt: tree.createdAt,
          updatedAt: tree.updatedAt,
        };
      }),
    );

    return {
      totalTrees,
      totalPersons,
      totalSystemAdmins,
      treesCreatedThisMonth,
      personsAddedThisMonth,
      recentTrees,
    };
  }

  // ============================================
  // TREE MANAGEMENT
  // ============================================

  /**
   * Get all trees with pagination
   */
  async getAllTrees(
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<PaginatedResponseDto<TreeSummaryDto>> {
    const skip = (page - 1) * limit;

    const whereClause = search
      ? [{ name: Like(`%${search}%`) }, { adminUsername: Like(`%${search}%`) }]
      : undefined;

    const [treesRaw, total] = await this.treeRepository.findAndCount({
      where: whereClause,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    // Get person counts
    const items: TreeSummaryDto[] = await Promise.all(
      treesRaw.map(async (tree) => {
        const personCount = await this.personRepository.count({
          where: { treeId: tree.id },
        });
        return {
          id: tree.id,
          name: tree.name,
          adminUsername: tree.adminUsername,
          personCount,
          createdAt: tree.createdAt,
          updatedAt: tree.updatedAt,
        };
      }),
    );

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get tree details by ID with all persons
   */
  async getTreeById(id: string): Promise<TreeDetailDto | null> {
    const tree = await this.treeRepository.findOne({
      where: { id },
    });

    if (!tree) return null;

    const persons = await this.personRepository.find({
      where: { treeId: id },
      order: { id: 'ASC' },
    });

    const personSummaries: PersonSummaryDto[] = persons.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      gender: p.gender,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      progenitor: p.progenitor,
      fatherId: p.fatherId,
      motherId: p.motherId,
    }));

    return {
      id: tree.id,
      name: tree.name,
      adminUsername: tree.adminUsername,
      guestUsername: tree.guestUsername,
      ownerEmail: tree.ownerEmail,
      personCount: persons.length,
      createdAt: tree.createdAt,
      updatedAt: tree.updatedAt,
      persons: personSummaries,
    };
  }

  /**
   * Delete a tree and all its persons
   */
  async deleteTree(id: string): Promise<boolean> {
    const tree = await this.treeRepository.findOne({ where: { id } });
    if (!tree) return false;

    // Persons are cascade deleted due to relation
    await this.treeRepository.remove(tree);
    this.logger.log(`Tree "${tree.name}" (${id}) deleted by system admin`);
    return true;
  }

  /**
   * Export tree data as JSON
   */
  async exportTree(id: string): Promise<TreeExportDto | null> {
    const tree = await this.treeRepository.findOne({ where: { id } });
    if (!tree) return null;

    const persons = await this.personRepository.find({
      where: { treeId: id },
      order: { id: 'ASC' },
    });

    const personSummaries: PersonSummaryDto[] = persons.map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      gender: p.gender,
      birthDate: p.birthDate,
      deathDate: p.deathDate,
      progenitor: p.progenitor,
      fatherId: p.fatherId,
      motherId: p.motherId,
    }));

    return {
      exportedAt: new Date().toISOString(),
      tree: {
        id: tree.id,
        name: tree.name,
        adminUsername: tree.adminUsername,
        guestUsername: tree.guestUsername,
        ownerEmail: tree.ownerEmail,
        createdAt: tree.createdAt,
        updatedAt: tree.updatedAt,
      },
      persons: personSummaries,
    };
  }

  // ============================================
  // PERSON MANAGEMENT
  // ============================================

  /**
   * Get person by ID (from any tree)
   */
  async getPersonById(personId: number): Promise<Person | null> {
    return this.personRepository.findOne({
      where: { id: personId },
    });
  }

  /**
   * Update any person (system admin override)
   */
  async updatePerson(
    personId: number,
    updateDto: UpdatePersonAdminDto,
  ): Promise<Person> {
    const person = await this.personRepository.findOne({
      where: { id: personId },
    });

    if (!person) {
      throw new NotFoundException(`Person with ID ${personId} not found`);
    }

    // Apply updates
    if (updateDto.firstName !== undefined)
      person.firstName = updateDto.firstName;
    if (updateDto.lastName !== undefined) person.lastName = updateDto.lastName;
    if (updateDto.gender !== undefined) person.gender = updateDto.gender;
    if (updateDto.birthDate !== undefined)
      person.birthDate = updateDto.birthDate;
    if (updateDto.deathDate !== undefined)
      person.deathDate = updateDto.deathDate;
    if (updateDto.trivia !== undefined) person.trivia = updateDto.trivia;
    if (updateDto.fatherId !== undefined) person.fatherId = updateDto.fatherId;
    if (updateDto.motherId !== undefined) person.motherId = updateDto.motherId;

    const updated = await this.personRepository.save(person);
    this.logger.log(
      `Person ${personId} updated by system admin: ${JSON.stringify(updateDto)}`,
    );
    return updated;
  }

  /**
   * Delete any person (system admin override)
   */
  async deletePerson(personId: number): Promise<boolean> {
    const person = await this.personRepository.findOne({
      where: { id: personId },
    });

    if (!person) return false;

    // Clear parent references from children
    await this.personRepository.update(
      { fatherId: personId },
      { fatherId: undefined },
    );
    await this.personRepository.update(
      { motherId: personId },
      { motherId: undefined },
    );

    await this.personRepository.remove(person);
    this.logger.log(
      `Person ${personId} (${person.firstName} ${person.lastName}) deleted by system admin`,
    );
    return true;
  }
}
