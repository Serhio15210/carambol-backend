import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from './types/jwt-payload.type';
import { UsersService } from '@/modules/users/users.service';
import { RequestUser } from './types/request-user.type';

// Passport — библиотека аутентификации из мира Express, Nest её оборачивает.
// Стратегия 'jwt' делает три вещи:
//  1. достаёт токен из заголовка  Authorization: Bearer <token>;
//  2. проверяет подпись и срок жизни (если что-то не так, сразу 401);
//  3. вызывает validate(), и результат записывается в request.user.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('jwt.secret'),
    });
  }

  // Runs on every request: the role always comes from the database, and a deleted
  // (not found) or blocked user loses access at once, without waiting for the token to expire.
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.usersService.findOneById(payload.sub);
    if (!user || user.blockedAt) {
      throw new UnauthorizedException('Access denied');
    }
    return { id: user.id, role: user.role };
  }
}
