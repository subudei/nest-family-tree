import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// Owner JWT — issued on email+password login
export interface OwnerJwtPayload {
  sub: string; // userId
  type: 'owner';
  email: string;
}

// Guest JWT — issued on guestUsername+password login
export interface GuestJwtPayload {
  sub: string; // treeId
  type: 'guest';
  treeName: string;
}

export type JwtPayload = OwnerJwtPayload | GuestJwtPayload;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    });
  }

  validate(payload: JwtPayload) {
    if (!payload.sub || !payload.type) {
      throw new UnauthorizedException('Invalid token');
    }

    if (payload.type === 'owner') {
      return {
        type: 'owner' as const,
        userId: payload.sub,
        email: payload.email,
      };
    }

    return {
      type: 'guest' as const,
      treeId: payload.sub,
      treeName: payload.treeName,
    };
  }
}
