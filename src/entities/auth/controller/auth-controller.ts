import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { LoginUserDto } from '@/entities/auth/dto/login-user.dto';
import { ClientProxy } from '@nestjs/microservices';
import { CreateUserDto } from '@/entities/users/dto/create-user.dto';
import { AUTH_SERVICE_PATTERNS } from '@/microservices/src/app/auth/shared/injection-tokens';
import { MICROSERVICE_CLIENTS } from '@/microservices/src/shared/injected-tokens';
import {
  ConfirmOtpCodeDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from '@/microservices/src/app/auth/dto/reset-user-password.dto';
import { LogoutDto, RefreshTokenDto } from '@/microservices/src/app/auth/dto/session.dto';
import { Auth } from '@/entities/auth/decorators/auth.decorator';
import { CurrentUser } from '@/entities/auth/decorators/current-user.decorator';
import { RequestUser } from '@/entities/users/interfaces/user.interface';
import { Request } from 'express';
import { SessionMetadataDto } from '@/entities/auth/dto/session-metadata.dto';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(MICROSERVICE_CLIENTS.AUTH)
    private readonly authServiceClient: ClientProxy,
  ) {}

  @Post('login')
  login(@Body() body: LoginUserDto, @Req() request: Request) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.LOGIN, {
      ...body,
      metadata: this.getSessionMetadata(request),
    });
  }

  @Post('register')
  register(@Body() body: CreateUserDto, @Req() request: Request) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.REGISTER, {
      ...body,
      metadata: this.getSessionMetadata(request),
    });
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: RequestPasswordResetDto) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.RESET_PASSWORD_REQUEST, body);
  }
  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.RESET_PASSWORD, body);
  }

  @Post('confirm-otp')
  confirmOtpCode(@Body() body: ConfirmOtpCodeDto) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.CONFIRM_OTP, body);
  }

  @Post('refresh')
  refresh(@Body() body: RefreshTokenDto) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.REFRESH, body);
  }

  @Post('logout')
  logout(@Body() body: LogoutDto) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.LOGOUT, body);
  }

  @Auth()
  @Post('logout-all')
  logoutAll(@CurrentUser() user: RequestUser) {
    return this.authServiceClient.send(AUTH_SERVICE_PATTERNS.LOGOUT_ALL, { userId: user.id });
  }

  private getSessionMetadata(request: Request): SessionMetadataDto {
    const forwardedFor = request.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const ip = forwardedIp?.split(',')[0]?.trim() || request.ip || null;
    const userAgent = request.headers['user-agent'];

    return {
      ip,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    };
  }
}
