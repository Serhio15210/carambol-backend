import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@/database/database.module';
import { MailModule } from '@/microservices/src/app/mail/module/mail.module';
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
    MailModule,
  ],
})
export class MailMicroserviceModule {}
