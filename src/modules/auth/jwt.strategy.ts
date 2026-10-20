import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './types/jwt-payload.type';
import { RequestUser } from './types/request-user.type';

// Passport — библиотека аутентификации из мира Express, Nest её оборачивает.
// Стратегия 'jwt' делает три вещи:
//  1. достаёт токен из заголовка  Authorization: Bearer <token>;
//  2. проверяет подпись и срок жизни (если что-то не так, сразу 401);
//  3. вызывает validate(), и результат записывается в request.user.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
    });
  }

  validate(payload: JwtPayload): RequestUser {
    return { id: payload.sub, role: payload.role };
  }
}
