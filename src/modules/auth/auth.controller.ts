import { Body, Controller, Headers, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionsService } from './sessions.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Auth } from './decorators/auth.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { RequestUser } from './types/request-user.type';
import { SessionMetadata } from './types/auth-response.type';

// Сравни с Express:
//   router.post('/auth/login', (req, res) => { ... })
// Здесь то же самое, только маршрут задают декораторы, body уже провалидирован,
// а возвращаемое значение Nest сам превратит в JSON-ответ.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
  ) {}

  // POST /api/auth/register
  @Post('register')
  register(@Body() body: RegisterDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.register(body, this.toMetadata(ip, userAgent));
  }

  // POST /api/auth/login
  // По умолчанию POST отвечает 201 Created, но при логине ничего не создаётся
  // с точки зрения клиента, поэтому возвращаем 200.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.authService.login(body, this.toMetadata(ip, userAgent));
  }

  // POST /api/auth/refresh   body: { refreshToken }
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshTokenDto) {
    return this.sessionsService.refresh(body.refreshToken);
  }

  // POST /api/auth/logout    body: { refreshToken } — выйти на этом устройстве
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: RefreshTokenDto) {
    return this.sessionsService.revoke(body.refreshToken);
  }

  // POST /api/auth/logout-all — выйти на всех устройствах (нужен access-токен)
  @Auth()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  logoutAll(@CurrentUser() user: RequestUser) {
    return this.sessionsService.revokeAllForUser(user.id);
  }

  private toMetadata(ip: string, userAgent?: string): SessionMetadata {
    return { ip: ip || null, userAgent: userAgent?.slice(0, 512) ?? null };
  }
}
