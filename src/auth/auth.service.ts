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
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dtos/register.dto';
import { OwnerLoginDto, GuestLoginDto } from './dtos/login.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { OwnerJwtPayload, GuestJwtPayload } from './strategies/jwt.strategy';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private treesService: TreesService,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const { email, password, treeName, guestUsername, guestPassword } = dto;

    // Check email is not already registered
    if (await this.usersService.isEmailTaken(email)) {
      throw new ConflictException('An account with this email already exists');
    }

    // Check guest username is globally unique
    if (await this.treesService.isGuestUsernameTaken(guestUsername)) {
      throw new ConflictException('Guest username is already taken');
    }

    // Hash owner account password and guest password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const guestPasswordHash = await bcrypt.hash(guestPassword, SALT_ROUNDS);

    // Create owner account
    const user = await this.usersService.create({ email, passwordHash });

    // Create the first tree linked to this owner
    const tree = await this.treesService.create({
      name: treeName,
      ownerId: user.id,
      guestUsername,
      guestPasswordHash,
    });

    // Return owner JWT
    const payload: OwnerJwtPayload = {
      sub: user.id,
      type: 'owner',
      email: user.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      type: 'owner' as const,
      userId: user.id,
      email: user.email,
      trees: [
        {
          id: tree.id,
          name: tree.name,
          guestUsername: tree.guestUsername,
          createdAt: tree.createdAt,
        },
      ],
    };
  }

  // ─── Owner login (email + password) ────────────────────────────────────────

  async loginOwner(dto: OwnerLoginDto) {
    const { email, password } = dto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Load all trees this owner has
    const trees = await this.treesService.findAllByOwner(user.id);

    const payload: OwnerJwtPayload = {
      sub: user.id,
      type: 'owner',
      email: user.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      type: 'owner' as const,
      userId: user.id,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      trees: trees.map((t) => ({
        id: t.id,
        name: t.name,
        guestUsername: t.guestUsername,
        createdAt: t.createdAt,
      })),
    };
  }

  // ─── Guest login (guestUsername + password) ─────────────────────────────────

  async loginGuest(dto: GuestLoginDto) {
    const { username, password } = dto;

    const tree = await this.treesService.findByGuestUsername(username);
    if (!tree) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      tree.guestPasswordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: GuestJwtPayload = {
      sub: tree.id,
      type: 'guest',
      treeName: tree.name,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      type: 'guest' as const,
      treeId: tree.id,
      treeName: tree.name,
    };
  }

  // ─── Get current user (from JWT) ────────────────────────────────────────────

  async getMe(
    user:
      | { type: 'owner'; userId: string; email: string }
      | { type: 'guest'; treeId: string; treeName: string },
  ) {
    if (user.type === 'owner') {
      const dbUser = await this.usersService.findById(user.userId);
      const trees = await this.treesService.findAllByOwner(user.userId);
      return {
        type: 'owner' as const,
        userId: user.userId,
        email: dbUser?.email || user.email,
        firstName: dbUser?.firstName || '',
        lastName: dbUser?.lastName || '',
        trees: trees.map((t) => ({
          id: t.id,
          name: t.name,
          guestUsername: t.guestUsername,
          createdAt: t.createdAt,
        })),
      };
    }

    return {
      type: 'guest' as const,
      treeId: user.treeId,
      treeName: user.treeName,
    };
  }

  // ─── Owner profile ──────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const trees = await this.treesService.findAllByOwner(userId);

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      createdAt: user.createdAt,
      trees: trees.map((t) => ({
        id: t.id,
        name: t.name,
        guestUsername: t.guestUsername,
        createdAt: t.createdAt,
      })),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const updateData: Partial<{
      email: string;
      firstName: string;
      lastName: string;
      passwordHash: string;
    }> = {};

    if (dto.firstName !== undefined) updateData.firstName = dto.firstName;
    if (dto.lastName !== undefined) updateData.lastName = dto.lastName;
    if (dto.email !== undefined) updateData.email = dto.email;

    if (dto.newPassword) {
      if (!dto.currentPassword) {
        throw new BadRequestException(
          'Current password is required to change password',
        );
      }
      const valid = await bcrypt.compare(
        dto.currentPassword,
        user.passwordHash,
      );
      if (!valid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      updateData.passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    }

    if (Object.keys(updateData).length === 0) {
      return { success: true, message: 'No changes made' };
    }

    await this.usersService.update(userId, updateData);
    return { success: true, message: 'Profile updated successfully' };
  }

  // ─── Password reset ─────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const { email } = dto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      // Don't reveal whether email exists
      return {
        message:
          'If an account with this email exists, you will receive a password reset link.',
      };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.usersService.update(user.id, {
      resetPasswordToken: resetToken,
      resetPasswordExpires: resetExpires,
    });

    await this.emailService.sendPasswordResetEmail(email, resetToken);

    return {
      message:
        'If an account with this email exists, you will receive a password reset link.',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const { token, newPassword } = dto;

    const user = await this.usersService.findByResetToken(token);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.usersService.update(user.id, {
      passwordHash,
      resetPasswordToken: undefined,
      resetPasswordExpires: undefined,
    });

    return { success: true, message: 'Password has been reset successfully' };
  }

  // ─── Tree not found helper ──────────────────────────────────────────────────

  private throwNotFound(msg: string): never {
    throw new NotFoundException(msg);
  }
}
