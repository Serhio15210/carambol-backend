import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { AuthController } from '@/entities/auth/controller/auth-controller';
import { authServiceClientOptions } from '@/shared/config/microserviceConfig';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from '@/entities/auth/strategy/jwt.strategy';

@Module({
  imports: [PassportModule, ClientsModule.register([authServiceClientOptions])],
  controllers: [AuthController],
  providers: [JwtStrategy],
})
export class AuthModule {}
