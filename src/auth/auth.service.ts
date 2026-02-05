import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TreesService } from '../trees/trees.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private treesService: TreesService,
    private jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto) {
    const {
      treeName,
      adminUsername,
      adminPassword,
      guestUsername,
      guestPassword,
      email,
    } = registerDto;

    // Check if admin username is taken
    if (await this.treesService.isUsernameTaken(adminUsername)) {
      throw new ConflictException('Admin username already taken');
    }

    // Check if guest username is taken
    if (await this.treesService.isUsernameTaken(guestUsername)) {
      throw new ConflictException('Guest username already taken');
    }

    // Check if admin and guest usernames are the same
    if (adminUsername.toLowerCase() === guestUsername.toLowerCase()) {
      throw new ConflictException(
        'Admin and guest usernames must be different',
      );
    }

    // Hash passwords
    const saltRounds = 10;
    const adminPasswordHash = await bcrypt.hash(adminPassword, saltRounds);
    const guestPasswordHash = await bcrypt.hash(guestPassword, saltRounds);

    // Create the tree
    const tree = await this.treesService.create({
      name: treeName,
      adminUsername,
      adminPasswordHash,
      guestUsername,
      guestPasswordHash,
      ownerEmail: email,
    });

    // Generate JWT for the new admin
    const payload: JwtPayload = {
      sub: tree.id,
      role: 'admin',
      treeName: tree.name,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      treeId: tree.id,
      treeName: tree.name,
      role: 'admin' as const,
    };
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    // Find tree by username (checks both admin and guest)
    const result = await this.treesService.findByUsername(username);

    if (!result) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { tree, role } = result;

    // Get the correct password hash based on role
    const passwordHash =
      role === 'admin' ? tree.adminPasswordHash : tree.guestPasswordHash;

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate JWT
    const payload: JwtPayload = {
      sub: tree.id,
      role,
      treeName: tree.name,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      treeId: tree.id,
      treeName: tree.name,
      role,
    };
  }

  async getMe(user: {
    treeId: string;
    role: 'admin' | 'guest';
    treeName: string;
  }) {
    // For admins, fetch firstName and lastName from the tree
    if (user.role === 'admin') {
      const tree = await this.treesService.findById(user.treeId);
      return {
        treeId: user.treeId,
        role: user.role,
        treeName: user.treeName,
        firstName: tree?.firstName || '',
        lastName: tree?.lastName || '',
      };
    }

    return {
      treeId: user.treeId,
      role: user.role,
      treeName: user.treeName,
    };
  }

  async getProfile(treeId: string) {
    const tree = await this.treesService.findById(treeId);
    if (!tree) {
      throw new UnauthorizedException('Tree not found');
    }

    return {
      treeId: tree.id,
      treeName: tree.name,
      email: tree.ownerEmail || '',
      firstName: tree.firstName || '',
      lastName: tree.lastName || '',
      adminUsername: tree.adminUsername,
      guestUsername: tree.guestUsername,
      createdAt: tree.createdAt,
    };
  }

  async updateProfile(treeId: string, updateProfileDto: UpdateProfileDto) {
    const tree = await this.treesService.findById(treeId);
    if (!tree) {
      throw new UnauthorizedException('Tree not found');
    }

    const updateData: {
      ownerEmail?: string;
      firstName?: string;
      lastName?: string;
      adminPasswordHash?: string;
      guestPasswordHash?: string;
    } = {};

    // Update firstName if provided
    if (updateProfileDto.firstName !== undefined) {
      updateData.firstName = updateProfileDto.firstName;
    }

    // Update lastName if provided
    if (updateProfileDto.lastName !== undefined) {
      updateData.lastName = updateProfileDto.lastName;
    }

    // Update email if provided
    if (updateProfileDto.email !== undefined) {
      updateData.ownerEmail = updateProfileDto.email;
    }

    // Update admin password if new password is provided
    if (updateProfileDto.newPassword) {
      if (!updateProfileDto.currentPassword) {
        throw new BadRequestException(
          'Current password is required to change password',
        );
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(
        updateProfileDto.currentPassword,
        tree.adminPasswordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Hash new password
      const saltRounds = 10;
      updateData.adminPasswordHash = await bcrypt.hash(
        updateProfileDto.newPassword,
        saltRounds,
      );
    }

    // Update guest password if provided
    if (updateProfileDto.newGuestPassword) {
      if (!updateProfileDto.currentPassword) {
        throw new BadRequestException(
          'Current password is required to change guest password',
        );
      }

      // Verify current (admin) password
      const isPasswordValid = await bcrypt.compare(
        updateProfileDto.currentPassword,
        tree.adminPasswordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Hash new guest password
      const saltRounds = 10;
      updateData.guestPasswordHash = await bcrypt.hash(
        updateProfileDto.newGuestPassword,
        saltRounds,
      );
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      return { success: true, message: 'No changes made' };
    }

    await this.treesService.update(treeId, updateData);

    return { success: true, message: 'Profile updated successfully' };
  }
}
