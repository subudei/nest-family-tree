import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TreesService } from '../trees/trees.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
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

  getMe(user: { treeId: string; role: 'admin' | 'guest'; treeName: string }) {
    return {
      treeId: user.treeId,
      role: user.role,
      treeName: user.treeName,
    };
  }
}
