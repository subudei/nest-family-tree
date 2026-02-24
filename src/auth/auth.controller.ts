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
import { OwnerLoginDto, GuestLoginDto } from './dtos/login.dto';
import { UpdateProfileDto } from './dtos/update-profile.dto';
import { ForgotPasswordDto } from './dtos/forgot-password.dto';
import { ResetPasswordDto } from './dtos/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';

type OwnerRequest = Request & {
  user: { type: 'owner'; userId: string; email: string };
};
type AnyAuthRequest = Request & {
  user:
    | { type: 'owner'; userId: string; email: string }
    | { type: 'guest'; treeId: string; treeName: string };
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Create a new owner account + first tree */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /** Owner logs in with email + password */
  @Post('login/owner')
  @HttpCode(HttpStatus.OK)
  async loginOwner(@Body() dto: OwnerLoginDto) {
    return this.authService.loginOwner(dto);
  }

  /** Guest logs in with guestUsername + password */
  @Post('login/guest')
  @HttpCode(HttpStatus.OK)
  async loginGuest(@Body() dto: GuestLoginDto) {
    return this.authService.loginGuest(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /** Returns current user info (works for both owner and guest) */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: AnyAuthRequest) {
    return this.authService.getMe(req.user);
  }

  /** Owner-only: full profile + all trees */
  @Get('profile')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getProfile(@Request() req: OwnerRequest) {
    return this.authService.getProfile(req.user.userId);
  }

  /** Owner-only: update name, email, password */
  @Patch('profile')
  @UseGuards(JwtAuthGuard, AdminGuard)
  updateProfile(@Request() req: OwnerRequest, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, dto);
  }
}
