import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UnauthorizedException,
  NotFoundException,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SystemAdminService } from './system-admin.service';
import { SystemAdminLoginDto } from './dtos/login.dto';
import { CreateSystemAdminDto } from './dtos/create-admin.dto';
import { UpdateSystemAdminDto } from './dtos/update-admin.dto';
import { UpdatePersonAdminDto } from './dtos/update-person-admin.dto';
import { SystemAdminGuard } from './guards/system-admin.guard';

interface SystemAdminJwtPayload {
  sub: string;
  role: 'systemadmin';
  displayName: string;
}

interface AuthenticatedRequest extends Request {
  systemAdmin: SystemAdminJwtPayload;
}

@Controller('system-admin')
export class SystemAdminController {
  constructor(
    private readonly systemAdminService: SystemAdminService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * POST /system-admin/login
   * Authenticate a system admin and return JWT
   */
  @Post('login')
  async login(@Body() loginDto: SystemAdminLoginDto) {
    const admin = await this.systemAdminService.findByUsername(
      loginDto.username,
    );

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await this.systemAdminService.validatePassword(
      admin,
      loginDto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login timestamp
    await this.systemAdminService.updateLastLogin(admin.id);

    // Generate JWT
    const payload: SystemAdminJwtPayload = {
      sub: admin.id,
      role: 'systemadmin',
      displayName: admin.displayName,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      adminId: admin.id,
      displayName: admin.displayName,
      role: 'systemadmin',
    };
  }

  /**
   * GET /system-admin/me
   * Get current system admin info
   */
  @Get('me')
  @UseGuards(SystemAdminGuard)
  async getMe(@Req() req: AuthenticatedRequest) {
    const admin = await this.systemAdminService.findById(req.systemAdmin.sub);

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      displayName: admin.displayName,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    };
  }

  // ============================================
  // DASHBOARD
  // ============================================

  /**
   * GET /system-admin/dashboard
   * Get dashboard statistics
   */
  @Get('dashboard')
  @UseGuards(SystemAdminGuard)
  async getDashboard() {
    return this.systemAdminService.getDashboardStats();
  }

  // ============================================
  // TREE MANAGEMENT
  // ============================================

  /**
   * GET /system-admin/trees
   * List all trees with pagination
   */
  @Get('trees')
  @UseGuards(SystemAdminGuard)
  async getTrees(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;

    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Invalid page number');
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (must be 1-100)');
    }

    return this.systemAdminService.getAllTrees(pageNum, limitNum, search);
  }

  /**
   * GET /system-admin/trees/:id
   * Get tree details with all persons
   */
  @Get('trees/:id')
  @UseGuards(SystemAdminGuard)
  async getTree(@Param('id') id: string) {
    const tree = await this.systemAdminService.getTreeById(id);
    if (!tree) {
      throw new NotFoundException(`Tree with ID ${id} not found`);
    }
    return tree;
  }

  /**
   * DELETE /system-admin/trees/:id
   * Delete a tree and all its persons
   */
  @Delete('trees/:id')
  @UseGuards(SystemAdminGuard)
  async deleteTree(@Param('id') id: string) {
    const deleted = await this.systemAdminService.deleteTree(id);
    if (!deleted) {
      throw new NotFoundException(`Tree with ID ${id} not found`);
    }
    return { message: 'Tree deleted successfully', id };
  }

  /**
   * GET /system-admin/trees/:id/export
   * Export tree data as JSON
   */
  @Get('trees/:id/export')
  @UseGuards(SystemAdminGuard)
  async exportTree(@Param('id') id: string) {
    const exportData = await this.systemAdminService.exportTree(id);
    if (!exportData) {
      throw new NotFoundException(`Tree with ID ${id} not found`);
    }
    return exportData;
  }

  // ============================================
  // PERSON MANAGEMENT
  // ============================================

  /**
   * PATCH /system-admin/persons/:id
   * Update any person (system admin override)
   */
  @Patch('persons/:id')
  @UseGuards(SystemAdminGuard)
  async updatePerson(
    @Param('id') id: string,
    @Body() updateDto: UpdatePersonAdminDto,
  ) {
    const personId = parseInt(id, 10);
    if (isNaN(personId)) {
      throw new BadRequestException('Invalid person ID');
    }
    return this.systemAdminService.updatePerson(personId, updateDto);
  }

  /**
   * DELETE /system-admin/persons/:id
   * Delete any person (system admin override)
   */
  @Delete('persons/:id')
  @UseGuards(SystemAdminGuard)
  async deletePerson(@Param('id') id: string) {
    const personId = parseInt(id, 10);
    if (isNaN(personId)) {
      throw new BadRequestException('Invalid person ID');
    }
    const deleted = await this.systemAdminService.deletePerson(personId);
    if (!deleted) {
      throw new NotFoundException(`Person with ID ${id} not found`);
    }
    return { message: 'Person deleted successfully', id: personId };
  }

  // ============================================
  // ADMIN MANAGEMENT
  // ============================================

  /**
   * GET /system-admin/admins
   * List all system admins
   */
  @Get('admins')
  @UseGuards(SystemAdminGuard)
  async getAdmins() {
    const admins = await this.systemAdminService.findAll();
    return admins.map((admin) => ({
      id: admin.id,
      username: admin.username,
      email: admin.email,
      displayName: admin.displayName,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    }));
  }

  /**
   * POST /system-admin/admins
   * Create a new system admin
   */
  @Post('admins')
  @UseGuards(SystemAdminGuard)
  async createAdmin(@Body() createDto: CreateSystemAdminDto) {
    // Check if username already exists
    const existing = await this.systemAdminService.findByUsername(
      createDto.username,
    );
    if (existing) {
      throw new BadRequestException('Username already taken');
    }

    const admin = await this.systemAdminService.create({
      username: createDto.username,
      password: createDto.password,
      email: createDto.email,
      displayName: createDto.displayName,
    });

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      displayName: admin.displayName,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
    };
  }

  /**
   * PATCH /system-admin/admins/:id
   * Update a system admin
   */
  @Patch('admins/:id')
  @UseGuards(SystemAdminGuard)
  async updateAdmin(
    @Param('id') id: string,
    @Body() updateDto: UpdateSystemAdminDto,
  ) {
    const admin = await this.systemAdminService.update(id, {
      email: updateDto.email,
      displayName: updateDto.displayName,
      password: updateDto.password,
      isActive: updateDto.isActive,
    });

    if (!admin) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    return {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      displayName: admin.displayName,
      isActive: admin.isActive,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    };
  }

  /**
   * DELETE /system-admin/admins/:id
   * Deactivate a system admin (soft delete)
   */
  @Delete('admins/:id')
  @UseGuards(SystemAdminGuard)
  async deactivateAdmin(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    // Prevent self-deactivation
    if (req.systemAdmin.sub === id) {
      throw new BadRequestException('Cannot deactivate your own account');
    }

    const deactivated = await this.systemAdminService.deactivate(id);
    if (!deactivated) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }
    return { message: 'Admin deactivated successfully', id };
  }
}
