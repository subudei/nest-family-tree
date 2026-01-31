import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

interface SystemAdminJwtPayload {
  sub: string;
  role: 'systemadmin';
  displayName: string;
}

@Injectable()
export class SystemAdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = this.jwtService.verify<SystemAdminJwtPayload>(token, {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      });

      if (payload.role !== 'systemadmin') {
        throw new ForbiddenException('System admin access required');
      }

      // Attach payload to request for use in controllers
      (
        request as Request & { systemAdmin: SystemAdminJwtPayload }
      ).systemAdmin = payload;
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
