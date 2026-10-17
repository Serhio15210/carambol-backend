import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@/entities/users/model/user.entity';
import { MailController } from '@/microservices/src/app/mail/controller/mail.controller';
import { MailService } from '@/microservices/src/app/mail/service/mail.service';
import { SmsModule } from '@/integrations/sms/sms.module';

@Module({
  controllers: [MailController],
  providers: [MailService],
  imports: [TypeOrmModule.forFeature([User]), SmsModule],
})
export class MailModule {}
