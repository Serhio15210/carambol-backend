import { Controller } from '@nestjs/common';
import { AuthService } from '../service/auth.service';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { ResetAuthService } from '@/microservices/src/app/auth/service/reset-auth.service';
import {
  ConfirmOtpCodeDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from '@/microservices/src/app/auth/dto/reset-user-password.dto';
import { AUTH_SERVICE_PATTERNS } from '@/microservices/src/app/auth/shared/injection-tokens';
import { SessionService } from '@/microservices/src/app/auth/service/session.service';
import {
  LogoutAllDto,
  LogoutDto,
  RefreshTokenDto,
} from '@/microservices/src/app/auth/dto/session.dto';
import {
  LoginWithSessionMetadataDto,
  RegisterWithSessionMetadataDto,
} from '@/microservices/src/app/auth/dto/auth-session-payload.dto';

@Controller()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authResetService: ResetAuthService,
    private readonly sessionService: SessionService,
  ) {}
  @MessagePattern(AUTH_SERVICE_PATTERNS.LOGIN)
  login(@Payload() credentials: LoginWithSessionMetadataDto) {
    return this.authService.login(credentials);
  }
  @MessagePattern(AUTH_SERVICE_PATTERNS.REGISTER)
  register(@Payload() credentials: RegisterWithSessionMetadataDto) {
    return this.authService.register(credentials);
  }
  @MessagePattern(AUTH_SERVICE_PATTERNS.RESET_PASSWORD_REQUEST)
  resetPasswordRequest(@Payload() credentials: RequestPasswordResetDto) {
    return this.authResetService.requestPasswordReset(credentials);
  }
  @MessagePattern(AUTH_SERVICE_PATTERNS.CONFIRM_OTP)
  confirmOtpCode(@Payload() data: ConfirmOtpCodeDto) {
    return this.authResetService.confirmOtpCode(data);
  }
  @MessagePattern(AUTH_SERVICE_PATTERNS.RESET_PASSWORD)
  resetPassword(@Payload() credentials: ResetPasswordDto) {
    return this.authResetService.resetPassword(credentials);
  }

  @MessagePattern(AUTH_SERVICE_PATTERNS.REFRESH)
  refresh(@Payload() data: RefreshTokenDto) {
    return this.sessionService.refresh(data.refreshToken);
  }

  @MessagePattern(AUTH_SERVICE_PATTERNS.LOGOUT)
  logout(@Payload() data: LogoutDto) {
    return this.sessionService.logout(data.refreshToken);
  }

  @MessagePattern(AUTH_SERVICE_PATTERNS.LOGOUT_ALL)
  logoutAll(@Payload() data: LogoutAllDto) {
    return this.sessionService.logoutAll(data.userId);
  }
}
