import { createHash, randomBytes, randomUUID } from 'crypto';
import { AuthReset } from '@/microservices/src/app/auth/model/auth-reset.entity';
import { DataSource, Repository } from 'typeorm';
import { UserBaseRepository } from '@/entities/users/repository/user-base.repository';
import { BadRequestException, Injectable } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { MAIL_SERVICE_PATTERNS } from '@/microservices/src/app/mail/shared/injection-tokens';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from '@/shared/outbox/service/outbox.service';
import {
  ConfirmOtpCodeDto,
  PasswordResetChannel,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from '@/microservices/src/app/auth/dto/reset-user-password.dto';
import { SessionService } from '@/microservices/src/app/auth/service/session.service';

@Injectable()
export class ResetAuthService {
  constructor(
    @InjectRepository(AuthReset)
    private readonly passwordResetTokenRepository: Repository<AuthReset>,
    private readonly userBaseRepository: UserBaseRepository,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly outboxService: OutboxService,
    private readonly sessionService: SessionService,
  ) {}
  private createResetToken() {
    const token = randomBytes(32).toString('hex');

    const tokenHash = createHash('sha256').update(token).digest('hex');

    return { token, tokenHash };
  }

  private createOtpCode() {
    const code = randomBytes(4).readUInt32BE(0).toString().slice(0, 6).padStart(6, '0');
    const codeHash = this.hashSecret(code);

    return { code, codeHash };
  }

  private hashSecret(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private resolveResetChannel(credentials: RequestPasswordResetDto): PasswordResetChannel {
    if (credentials.channel) {
      return credentials.channel;
    }

    return credentials.login.includes('@') ? 'email' : 'phone';
  }

  async requestPasswordReset(credentials: RequestPasswordResetDto) {
    const user = await this.userBaseRepository.getUserByLogin(credentials.login);

    if (!user) {
      return this.resetRequestedResponse();
    }

    const channel = this.resolveResetChannel(credentials);
    const target = channel === 'phone' ? user.phone : user.email;

    if (!target) {
      return this.resetRequestedResponse();
    }

    const eventId = randomUUID();
    const requestedAt = new Date().toISOString();

    const resetToken = channel === 'email' ? this.createResetToken() : null;
    const otp = channel === 'phone' ? this.createOtpCode() : null;
    const resetUrl = resetToken
      ? `${this.config.getOrThrow<string>('frontend.resetPasswordUrl')}?token=${resetToken.token}`
      : undefined;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(AuthReset, {
        userId: user.id,
        channel,
        target,
        tokenHash: resetToken?.tokenHash ?? null,
        otpCodeHash: otp?.codeHash ?? null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        usedAt: null,
        confirmedAt: null,
      });

      await this.outboxService.createEvent(manager, {
        topic:
          channel === 'phone'
            ? MAIL_SERVICE_PATTERNS.RESET_SMS
            : MAIL_SERVICE_PATTERNS.RESET_PASSWORD_REQUEST,
        payload: {
          eventId,
          userId: user.id,
          email: channel === 'email' ? user.email : undefined,
          phone: channel === 'phone' ? user.phone : undefined,
          channel,
          resetUrl,
          otpCode: otp?.code,
          requestedAt,
        },
      });
    });

    return this.resetRequestedResponse();
  }

  private resetRequestedResponse() {
    return {
      message: 'If account exists, reset instructions were sent',
    };
  }
  async confirmOtpCode(credentials: ConfirmOtpCodeDto) {
    const user = await this.userBaseRepository.getUserByLogin(credentials.login);

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const otpCodeHash = this.hashSecret(credentials.code);

    const resetRequest = await this.passwordResetTokenRepository.findOne({
      where: {
        otpCodeHash,
        channel: 'phone',
        userId: user.id,
      },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });

    if (!resetRequest) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    if (resetRequest.usedAt || resetRequest.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired OTP code');
    }

    const { token, tokenHash } = this.createResetToken();

    await this.dataSource.transaction(async (manager) => {
      resetRequest.tokenHash = tokenHash;
      resetRequest.otpCodeHash = null;
      resetRequest.confirmedAt = new Date();

      await manager.save(resetRequest);
    });

    return { token };
  }

  async resetPassword(credentials: ResetPasswordDto) {
    const tokenHash = this.hashSecret(credentials.token);

    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetToken.usedAt) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await hash(credentials.newPassword, 10);

    resetToken.user.passwordHash = passwordHash;
    resetToken.usedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(resetToken.user);

      await manager.save(resetToken);

      await this.sessionService.revokeAllForUser(resetToken.userId, manager);
    });

    return {
      message: 'Password has been reset',
    };
  }
}
