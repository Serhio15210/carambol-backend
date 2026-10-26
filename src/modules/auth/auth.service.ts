import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { compare } from 'bcryptjs';
import { hashPassword } from '@/common/security/password';
import { UsersService } from '@/modules/users/users.service';
import { toPublicUser } from '@/modules/users/types/public-user.type';
import { SessionsService } from './sessions.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponse, SessionMetadata } from './types/auth-response.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  async register(dto: RegisterDto, metadata: SessionMetadata): Promise<AuthResponse> {
    const { password, ...profile } = dto;
    const passwordHash = await hashPassword(password);

    const user = await this.usersService.create({ ...profile, passwordHash });
    const tokens = await this.sessionsService.createSession(user, metadata);

    return { ...tokens, user: toPublicUser(user) };
  }

  async login(dto: LoginDto, metadata: SessionMetadata): Promise<AuthResponse> {
    const { login, password } = dto;
    const normalizedLogin = login.includes('@') ? login.trim().toLowerCase() : login.trim();
    const user = await this.usersService.findByLoginWithPassword(normalizedLogin);
    const isPasswordValid = user && (await compare(password, user.passwordHash));
    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Checked only AFTER a correct password, so it reveals nothing to someone guessing logins.
    if (user.blockedAt) {
      throw new ForbiddenException('Account is blocked');
    }

    const tokens = await this.sessionsService.createSession(user, metadata);
    return { ...tokens, user: toPublicUser(user) };
  }
}
