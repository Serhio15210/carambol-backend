import { Module } from '@nestjs/common';
import { AuthService } from '../service/auth.service';
import { AuthController } from '../controller/auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/entities/users/model/user.entity';
import { AuthReset } from '@/microservices/src/app/auth/model/auth-reset.entity';
import { ResetAuthService } from '../service/reset-auth.service';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserBaseRepository } from '@/entities/users/repository/user-base.repository';
import { JwtTokenService } from '@/entities/auth/service/jwt.service';
import { OutboxModule } from '@/shared/outbox/outbox.module';
import { AuthSession } from '@/microservices/src/app/auth/model/auth-session.entity';
import { SessionService } from '@/microservices/src/app/auth/service/session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, ResetAuthService, SessionService, UserBaseRepository, JwtTokenService],
  imports: [
    TypeOrmModule.forFeature([User, AuthReset, AuthSession]),
    OutboxModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const expiresIn = config.getOrThrow<string>('jwt.accessExpiresIn') as NonNullable<
          JwtModuleOptions['signOptions']
        >['expiresIn'];

        return {
          secret: config.getOrThrow<string>('jwt.secret'),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
})
export class AuthModule {}
