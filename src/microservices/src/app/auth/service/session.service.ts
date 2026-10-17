import { createHash, randomBytes } from 'crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { AuthSession } from '@/microservices/src/app/auth/model/auth-session.entity';
import { User } from '@/entities/users/model/user.entity';
import { JwtTokenService } from '@/entities/auth/service/jwt.service';
import { AuthUser } from '@/entities/users/interfaces/user.interface';
import { SessionMetadataDto } from '@/entities/auth/dto/session-metadata.dto';

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type RefreshResponse = TokenPair & {
  user: AuthUser;
};

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(AuthSession)
    private readonly sessionRepository: Repository<AuthSession>,
    private readonly config: ConfigService,
    private readonly jwtService: JwtTokenService,
  ) {}

  async createSession(user: User, metadata?: SessionMetadataDto): Promise<TokenPair> {
    const accessToken = await this.jwtService.createAccessToken(user);
    const { token: refreshToken, tokenHash } = this.createRefreshToken();

    await this.sessionRepository.save({
      userId: user.id,
      refreshTokenHash: tokenHash,
      expiresAt: this.createRefreshExpiresAt(),
      revokedAt: null,
      lastUsedAt: null,
      userAgent: metadata?.userAgent ?? null,
      ip: metadata?.ip ?? null,
    });

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.sessionRepository.findOne({
      where: {
        refreshTokenHash,
        revokedAt: IsNull(),
      },
      relations: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const { token: newRefreshToken, tokenHash: newRefreshTokenHash } = this.createRefreshToken();

    session.refreshTokenHash = newRefreshTokenHash;
    session.lastUsedAt = new Date();
    session.expiresAt = this.createRefreshExpiresAt();

    await this.sessionRepository.save(session);

    return {
      accessToken: await this.jwtService.createAccessToken(session.user),
      refreshToken: newRefreshToken,
      user: this.toAuthUser(session.user),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessionRepository.update(
      {
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );
  }

  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllForUser(userId);
  }

  async revokeAllForUser(userId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(AuthSession) : this.sessionRepository;

    await repository.update(
      {
        userId,
        revokedAt: IsNull(),
      },
      { revokedAt: new Date() },
    );
  }

  private createRefreshToken() {
    const token = randomBytes(64).toString('hex');
    const tokenHash = this.hashRefreshToken(token);

    return { token, tokenHash };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createRefreshExpiresAt(): Date {
    const days = this.config.getOrThrow<number>('jwt.refreshExpiresInDays');

    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private toAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      email: user.email,
      userName: user.userName,
      phone: user.phone,
      role: user.role,
    };
  }
}
