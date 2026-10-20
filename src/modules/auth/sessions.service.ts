import { createHash, randomBytes } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { AuthSession } from './entities/auth-session.entity';
import { JwtPayload } from './types/jwt-payload.type';
import { SessionMetadata, TokenPair } from './types/auth-response.type';

// Отвечает за пару токенов:
//  access-токен  — JWT, живёт 15 минут, проверяется без похода в БД;
//  refresh-токен — случайная строка, живёт 30 дней, хранится в БД (в виде хеша),
//                  нужен только чтобы получить новый access-токен.
@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(AuthSession)
    private readonly sessionsRepository: Repository<AuthSession>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async createSession(user: User, metadata: SessionMetadata): Promise<TokenPair> {
    const refreshToken = this.generateRefreshToken();

    await this.sessionsRepository.save({
      userId: user.id,
      refreshTokenHash: this.hash(refreshToken),
      expiresAt: this.refreshExpiresAt(),
      revokedAt: null,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    });

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
    };
  }

  // Rotation: при каждом refresh старый refresh-токен перестаёт работать,
  // клиент получает новый. Украденный токен работает максимум до первого refresh.
  async refresh(refreshToken: string): Promise<TokenPair> {
    const session = await this.sessionsRepository.findOne({
      where: { refreshTokenHash: this.hash(refreshToken), revokedAt: IsNull() },
      relations: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const newRefreshToken = this.generateRefreshToken();
    session.refreshTokenHash = this.hash(newRefreshToken);
    session.expiresAt = this.refreshExpiresAt();
    await this.sessionsRepository.save(session);

    return {
      accessToken: await this.signAccessToken(session.user),
      refreshToken: newRefreshToken,
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.sessionsRepository.update(
      { refreshTokenHash: this.hash(refreshToken), revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.sessionsRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    return this.jwtService.signAsync(payload);
  }

  // 64 случайных байта — угадать такой токен невозможно.
  private generateRefreshToken(): string {
    return randomBytes(64).toString('hex');
  }

  // Для паролей нужен медленный bcrypt (их перебирают по словарю),
  // а refresh-токен и так случайный, ему хватает быстрого SHA-256.
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiresAt(): Date {
    const days = this.config.getOrThrow<number>('jwt.refreshExpiresInDays');
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
