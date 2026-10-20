import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard запускает стратегию 'jwt' из jwt.strategy.ts.
// Нет токена или он невалидный — 401 Unauthorized, контроллер не вызывается.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
