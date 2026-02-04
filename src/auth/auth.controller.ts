import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dtos/register.dto';
import { LoginDto } from './dtos/login.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(
    @Request()
    req: {
      user: { treeId: string; role: 'admin' | 'guest'; treeName: string };
    },
  ) {
    return this.authService.getMe(req.user);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getProfile(
    @Request()
    req: {
      user: { treeId: string; role: 'admin' | 'guest'; treeName: string };
    },
  ) {
    return this.authService.getProfile(req.user.treeId);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard, AdminGuard)
  updateProfile(
    @Request()
    req: {
      user: { treeId: string; role: 'admin' | 'guest'; treeName: string };
    },
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.treeId, updateProfileDto);
  }
}
