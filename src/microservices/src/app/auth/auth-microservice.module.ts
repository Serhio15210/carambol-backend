import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/microservices/src/app/auth/module/auth.module';
import { appConfig, validateEnv } from '@/shared/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validate: validateEnv,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    AuthModule,
  ],
})
export class AuthMicroserviceModule {}
