import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@/entities/auth/interfaces/jwt.interface';
import { RequestUser } from '@/entities/users/interfaces/user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
    });
  }

  validate(payload: JwtPayload): RequestUser {
    return {
      id: payload.sub,
      email: payload.email ?? null,
      userName: payload.userName,
      role: payload.role,
    };
  }
}
