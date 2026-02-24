import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

interface AuthenticatedUser {
  type: 'owner' | 'guest';
  userId?: string;
  email?: string;
  treeId?: string;
  treeName?: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

// Allows only logged-in owners (email+password accounts)
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.type !== 'owner') {
      throw new ForbiddenException('Owner access required');
    }

    return true;
  }
}
