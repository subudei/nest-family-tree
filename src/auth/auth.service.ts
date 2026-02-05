import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { TreesService } from '../trees/trees.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private treesService: TreesService,
    private jwtService: JwtService,
    private emailService: EmailService,
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

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email, treeId } = forgotPasswordDto;

    // Find all trees with this email
    const trees = await this.treesService.findByEmail(email);

    if (trees.length === 0) {
      // Don't reveal if email exists for security
      return {
        message:
          'If an account with this email exists, you will receive a password reset link.',
        requiresTreeSelection: false,
      };
    }

    // If treeId is not provided and there are multiple trees, return tree selection
    if (!treeId && trees.length > 1) {
      return {
        message: 'Multiple trees found. Please select which tree to reset.',
        requiresTreeSelection: true,
        trees: trees.map((t) => ({
          id: t.id,
          name: t.name,
          adminUsername: t.adminUsername,
        })),
      };
    }

    // Find the specific tree (either the only one, or the selected one)
    const tree = treeId ? trees.find((t) => t.id === treeId) : trees[0];

    if (!tree) {
      throw new NotFoundException('Tree not found');
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save token to database
    await this.treesService.update(tree.id, {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetExpires,
    });

    // Send email
    await this.emailService.sendPasswordResetEmail(
      email,
      tree.name,
      tree.adminUsername,
      resetToken,
    );

    return {
      message:
        'If an account with this email exists, you will receive a password reset link.',
      requiresTreeSelection: false,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { token, newPassword } = resetPasswordDto;

    // Find tree by reset token
    const tree = await this.treesService.findByResetToken(token);

    if (!tree) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Check if token is expired
    if (!tree.resetPasswordExpires || tree.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Hash new password
    const saltRounds = 10;
    const adminPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    await this.treesService.update(tree.id, {
      adminPasswordHash,
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
    });

    return { success: true, message: 'Password has been reset successfully' };
  }
}
