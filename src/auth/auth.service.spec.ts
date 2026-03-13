import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { TreesService } from '../trees/trees.service';
import { EmailService } from '../email/email.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

const USER_ID = 'user-uuid-1';
const TREE_ID = 'tree-uuid-1';

function makeUser(overrides: Partial<any> = {}) {
  return {
    id: USER_ID,
    email: 'test@example.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'John',
    lastName: 'Doe',
    resetPasswordToken: undefined,
    resetPasswordExpires: undefined,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeTree(overrides: Partial<any> = {}) {
  return {
    id: TREE_ID,
    name: 'Test Tree',
    guestUsername: 'testguest',
    guestPasswordHash: '$2b$10$hashedguestpw',
    ownerId: USER_ID,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockUsersService = {
  isEmailTaken: jest.fn(),
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  findByResetToken: jest.fn(),
  update: jest.fn(),
};

const mockTreesService = {
  isGuestUsernameTaken: jest.fn(),
  create: jest.fn(),
  findAllByOwner: jest.fn(),
  findByGuestUsername: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
};

const mockEmailService = {
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: TreesService, useValue: mockTreesService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // register
  // ═══════════════════════════════════════════════════════════════════════════

  describe('register', () => {
    const registerDto = {
      email: 'new@example.com',
      password: 'Password1',
      treeName: 'My Family',
      guestUsername: 'myfamily_guest',
      guestPassword: 'Guest123',
    };

    it('should register successfully and return JWT + tree info', async () => {
      const user = makeUser({ email: registerDto.email });
      const tree = makeTree({
        name: registerDto.treeName,
        guestUsername: registerDto.guestUsername,
      });

      mockUsersService.isEmailTaken.mockResolvedValue(false);
      mockTreesService.isGuestUsernameTaken.mockResolvedValue(false);
      mockUsersService.create.mockResolvedValue(user);
      mockTreesService.create.mockResolvedValue(tree);

      const result = await service.register(registerDto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.type).toBe('owner');
      expect(result.userId).toBe(USER_ID);
      expect(result.email).toBe(registerDto.email);
      expect(result.trees).toHaveLength(1);
      expect(result.trees[0].name).toBe(registerDto.treeName);
      expect(result.trees[0].guestUsername).toBe(registerDto.guestUsername);
    });

    it('should hash the password before creating the user', async () => {
      mockUsersService.isEmailTaken.mockResolvedValue(false);
      mockTreesService.isGuestUsernameTaken.mockResolvedValue(false);
      mockUsersService.create.mockResolvedValue(makeUser());
      mockTreesService.create.mockResolvedValue(makeTree());

      await service.register(registerDto);

      const createCall = mockUsersService.create.mock.calls[0][0];
      expect(createCall.email).toBe(registerDto.email);
      // Password should be hashed, not plain text
      expect(createCall.passwordHash).not.toBe(registerDto.password);
      expect(createCall.passwordHash).toMatch(/^\$2[ab]\$/);
    });

    it('should hash the guest password before creating the tree', async () => {
      mockUsersService.isEmailTaken.mockResolvedValue(false);
      mockTreesService.isGuestUsernameTaken.mockResolvedValue(false);
      mockUsersService.create.mockResolvedValue(makeUser());
      mockTreesService.create.mockResolvedValue(makeTree());

      await service.register(registerDto);

      const treeCreateCall = mockTreesService.create.mock.calls[0][0];
      expect(treeCreateCall.guestPasswordHash).not.toBe(
        registerDto.guestPassword,
      );
      expect(treeCreateCall.guestPasswordHash).toMatch(/^\$2[ab]\$/);
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockUsersService.isEmailTaken.mockResolvedValue(true);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if guest username is already taken', async () => {
      mockUsersService.isEmailTaken.mockResolvedValue(false);
      mockTreesService.isGuestUsernameTaken.mockResolvedValue(true);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockUsersService.create).not.toHaveBeenCalled();
    });

    it('should sign JWT with correct owner payload', async () => {
      const user = makeUser({ email: registerDto.email });
      mockUsersService.isEmailTaken.mockResolvedValue(false);
      mockTreesService.isGuestUsernameTaken.mockResolvedValue(false);
      mockUsersService.create.mockResolvedValue(user);
      mockTreesService.create.mockResolvedValue(makeTree());

      await service.register(registerDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: USER_ID,
        type: 'owner',
        email: registerDto.email,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // loginOwner
  // ═══════════════════════════════════════════════════════════════════════════

  describe('loginOwner', () => {
    const loginDto = { email: 'test@example.com', password: 'Password1' };

    it('should login successfully and return JWT + trees', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('Password1', 10),
      });
      const trees = [makeTree()];

      mockUsersService.findByEmail.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue(trees);

      const result = await service.loginOwner(loginDto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.type).toBe('owner');
      expect(result.userId).toBe(USER_ID);
      expect(result.email).toBe(loginDto.email);
      expect(result.trees).toHaveLength(1);
    });

    it('should return firstName and lastName from user', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('Password1', 10),
        firstName: 'John',
        lastName: 'Doe',
      });
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue([]);

      const result = await service.loginOwner(loginDto);

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
    });

    it('should throw UnauthorizedException if email not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.loginOwner(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password is wrong', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('DifferentPass1', 10),
      });
      mockUsersService.findByEmail.mockResolvedValue(user);

      await expect(service.loginOwner(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should sign JWT with owner payload', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('Password1', 10),
      });
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue([]);

      await service.loginOwner(loginDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: USER_ID,
        type: 'owner',
        email: user.email,
      });
    });

    it('should map multiple trees correctly', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('Password1', 10),
      });
      const trees = [
        makeTree({ id: 'tree-1', name: 'Tree One' }),
        makeTree({ id: 'tree-2', name: 'Tree Two' }),
      ];
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue(trees);

      const result = await service.loginOwner(loginDto);

      expect(result.trees).toHaveLength(2);
      expect(result.trees[0].name).toBe('Tree One');
      expect(result.trees[1].name).toBe('Tree Two');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // loginGuest
  // ═══════════════════════════════════════════════════════════════════════════

  describe('loginGuest', () => {
    const guestDto = { username: 'testguest', password: 'Guest123' };

    it('should login guest successfully and return JWT', async () => {
      const tree = makeTree({
        guestPasswordHash: await bcrypt.hash('Guest123', 10),
      });
      mockTreesService.findByGuestUsername.mockResolvedValue(tree);

      const result = await service.loginGuest(guestDto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.type).toBe('guest');
      expect(result.treeId).toBe(TREE_ID);
      expect(result.treeName).toBe('Test Tree');
    });

    it('should throw UnauthorizedException if guest username not found', async () => {
      mockTreesService.findByGuestUsername.mockResolvedValue(null);

      await expect(service.loginGuest(guestDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if guest password is wrong', async () => {
      const tree = makeTree({
        guestPasswordHash: await bcrypt.hash('WrongPassword', 10),
      });
      mockTreesService.findByGuestUsername.mockResolvedValue(tree);

      await expect(service.loginGuest(guestDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should sign JWT with guest payload', async () => {
      const tree = makeTree({
        guestPasswordHash: await bcrypt.hash('Guest123', 10),
      });
      mockTreesService.findByGuestUsername.mockResolvedValue(tree);

      await service.loginGuest(guestDto);

      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: TREE_ID,
        type: 'guest',
        treeName: 'Test Tree',
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getMe
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getMe', () => {
    it('should return owner info with trees', async () => {
      const user = makeUser();
      const trees = [makeTree()];
      mockUsersService.findById.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue(trees);

      const result = await service.getMe({
        type: 'owner',
        userId: USER_ID,
        email: 'test@example.com',
      });

      expect(result.type).toBe('owner');
      expect((result as any).userId).toBe(USER_ID);
      expect((result as any).email).toBe('test@example.com');
      expect((result as any).firstName).toBe('John');
      expect((result as any).lastName).toBe('Doe');
      expect((result as any).trees).toHaveLength(1);
    });

    it('should return empty strings for missing firstName/lastName', async () => {
      const user = makeUser({ firstName: null, lastName: null });
      mockUsersService.findById.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue([]);

      const result = await service.getMe({
        type: 'owner',
        userId: USER_ID,
        email: 'test@example.com',
      });

      expect((result as any).firstName).toBe('');
      expect((result as any).lastName).toBe('');
    });

    it('should fall back to JWT email if dbUser has no email', async () => {
      const user = makeUser({ email: undefined });
      mockUsersService.findById.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue([]);

      const result = await service.getMe({
        type: 'owner',
        userId: USER_ID,
        email: 'jwt@example.com',
      });

      expect((result as any).email).toBe('jwt@example.com');
    });

    it('should return guest info directly', async () => {
      const result = await service.getMe({
        type: 'guest',
        treeId: TREE_ID,
        treeName: 'Test Tree',
      });

      expect(result.type).toBe('guest');
      expect((result as any).treeId).toBe(TREE_ID);
      expect((result as any).treeName).toBe('Test Tree');
      // Should not call any services for guest
      expect(mockUsersService.findById).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getProfile
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getProfile', () => {
    it('should return full profile with trees', async () => {
      const user = makeUser();
      const trees = [makeTree()];
      mockUsersService.findById.mockResolvedValue(user);
      mockTreesService.findAllByOwner.mockResolvedValue(trees);

      const result = await service.getProfile(USER_ID);

      expect(result.userId).toBe(USER_ID);
      expect(result.email).toBe('test@example.com');
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.trees).toHaveLength(1);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(service.getProfile(USER_ID)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateProfile
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateProfile', () => {
    it('should update firstName and lastName', async () => {
      const user = makeUser();
      mockUsersService.findById.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      const result = await service.updateProfile(USER_ID, {
        firstName: 'Jane',
        lastName: 'Smith',
      });

      expect(mockUsersService.update).toHaveBeenCalledWith(USER_ID, {
        firstName: 'Jane',
        lastName: 'Smith',
      });
      expect(result.success).toBe(true);
    });

    it('should update email', async () => {
      const user = makeUser();
      mockUsersService.findById.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      await service.updateProfile(USER_ID, { email: 'new@example.com' });

      expect(mockUsersService.update).toHaveBeenCalledWith(USER_ID, {
        email: 'new@example.com',
      });
    });

    it('should update password when currentPassword is correct', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('OldPass1', 10),
      });
      mockUsersService.findById.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      const result = await service.updateProfile(USER_ID, {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
      });

      expect(result.success).toBe(true);
      const updateCall = mockUsersService.update.mock.calls[0][1];
      expect(updateCall.passwordHash).toBeDefined();
      expect(updateCall.passwordHash).toMatch(/^\$2[ab]\$/);
    });

    it('should throw BadRequestException if newPassword without currentPassword', async () => {
      const user = makeUser();
      mockUsersService.findById.mockResolvedValue(user);

      await expect(
        service.updateProfile(USER_ID, { newPassword: 'NewPass1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if currentPassword is wrong', async () => {
      const user = makeUser({
        passwordHash: await bcrypt.hash('CorrectPass1', 10),
      });
      mockUsersService.findById.mockResolvedValue(user);

      await expect(
        service.updateProfile(USER_ID, {
          currentPassword: 'WrongPass1',
          newPassword: 'NewPass1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return no-changes message when dto is empty', async () => {
      const user = makeUser();
      mockUsersService.findById.mockResolvedValue(user);

      const result = await service.updateProfile(USER_ID, {});

      expect(result.message).toBe('No changes made');
      expect(mockUsersService.update).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      await expect(
        service.updateProfile(USER_ID, { firstName: 'Jane' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // forgotPassword
  // ═══════════════════════════════════════════════════════════════════════════

  describe('forgotPassword', () => {
    it('should generate reset token and send email for existing user', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      const result = await service.forgotPassword({
        email: 'test@example.com',
      });

      expect(result.message).toContain('If an account with this email exists');
      expect(mockUsersService.update).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          resetPasswordToken: expect.any(String),
          resetPasswordExpires: expect.any(Date),
        }),
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.any(String),
      );
    });

    it('should return same message for non-existent email (no information leak)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nonexistent@example.com',
      });

      expect(result.message).toContain('If an account with this email exists');
      expect(mockUsersService.update).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should set token expiry to 1 hour from now', async () => {
      const user = makeUser();
      mockUsersService.findByEmail.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      const before = Date.now();
      await service.forgotPassword({ email: 'test@example.com' });
      const after = Date.now();

      const updateCall = mockUsersService.update.mock.calls[0][1];
      const expires = updateCall.resetPasswordExpires.getTime();
      // Expiry should be ~1 hour from now (with 5s tolerance)
      expect(expires).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 5000);
      expect(expires).toBeLessThanOrEqual(after + 60 * 60 * 1000 + 5000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // resetPassword
  // ═══════════════════════════════════════════════════════════════════════════

  describe('resetPassword', () => {
    it('should reset password successfully with valid token', async () => {
      const user = makeUser({
        resetPasswordToken: 'valid-token',
        resetPasswordExpires: new Date(Date.now() + 3600000), // 1 hour from now
      });
      mockUsersService.findByResetToken.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      const result = await service.resetPassword({
        token: 'valid-token',
        newPassword: 'NewPass123',
      });

      expect(result.success).toBe(true);
      const updateCall = mockUsersService.update.mock.calls[0][1];
      expect(updateCall.passwordHash).toMatch(/^\$2[ab]\$/);
      expect(updateCall.resetPasswordToken).toBeUndefined();
      expect(updateCall.resetPasswordExpires).toBeUndefined();
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockUsersService.findByResetToken.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'bad-token',
          newPassword: 'NewPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired token', async () => {
      const user = makeUser({
        resetPasswordToken: 'expired-token',
        resetPasswordExpires: new Date(Date.now() - 3600000), // 1 hour ago
      });
      mockUsersService.findByResetToken.mockResolvedValue(user);

      await expect(
        service.resetPassword({
          token: 'expired-token',
          newPassword: 'NewPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if resetPasswordExpires is null', async () => {
      const user = makeUser({
        resetPasswordToken: 'token',
        resetPasswordExpires: null,
      });
      mockUsersService.findByResetToken.mockResolvedValue(user);

      await expect(
        service.resetPassword({
          token: 'token',
          newPassword: 'NewPass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should clear reset token fields after successful reset', async () => {
      const user = makeUser({
        resetPasswordToken: 'valid-token',
        resetPasswordExpires: new Date(Date.now() + 3600000),
      });
      mockUsersService.findByResetToken.mockResolvedValue(user);
      mockUsersService.update.mockResolvedValue(user);

      await service.resetPassword({
        token: 'valid-token',
        newPassword: 'NewPass123',
      });

      expect(mockUsersService.update).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({
          resetPasswordToken: undefined,
          resetPasswordExpires: undefined,
        }),
      );
    });
  });
});
