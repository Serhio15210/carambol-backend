import { Injectable, NotImplementedException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { UsersService } from '@/modules/users/users.service';
import { toPublicUser } from '@/modules/users/types/public-user.type';
import { SessionsService } from './sessions.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse, SessionMetadata } from './types/auth-response.type';

// Сколько раундов хеширования делает bcrypt: 2^10 итераций.
// Больше — медленнее подбор пароля, но и медленнее логин.
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  async register(dto: RegisterDto, metadata: SessionMetadata): Promise<AuthResponse> {
    const { password, ...profile } = dto;
    const passwordHash = await hash(password, BCRYPT_ROUNDS);

    const user = await this.usersService.create({ ...profile, passwordHash });
    const tokens = await this.sessionsService.createSession(user, metadata);

    return { ...tokens, user: toPublicUser(user) };
  }

  // Урок 6: логин напишешь ты (поиск пользователя, проверка пароля, создание сессии).
  // Пока это заглушка, чтобы проект собирался и запускался на уроках 1–5.
  // Префикс _ у параметров означает «параметр пока намеренно не используется».
  login(_dto: LoginDto, _metadata: SessionMetadata): Promise<AuthResponse> {
    throw new NotImplementedException('Login will be implemented in lesson 6');
  }
}
