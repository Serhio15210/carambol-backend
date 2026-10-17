import { Controller } from '@nestjs/common';
import { MailService } from '@/microservices/src/app/mail/service/mail.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  OrderMailEventDto,
  PasswordResetRequestedEventDto,
} from '@/microservices/src/app/mail/dto/mail.dto';
import { MAIL_SERVICE_PATTERNS } from '@/microservices/src/app/mail/shared/injection-tokens';

@Controller()
export class MailController {
  constructor(private readonly mailService: MailService) {}
  @EventPattern(MAIL_SERVICE_PATTERNS.RESET_PASSWORD_REQUEST)
  async sendPasswordResetEmail(@Payload() event: PasswordResetRequestedEventDto) {
    await this.mailService.sendPasswordResetEmail(event);
  }
  @EventPattern(MAIL_SERVICE_PATTERNS.RESET_SMS)
  async sendPasswordResetSms(@Payload() event: PasswordResetRequestedEventDto) {
    await this.mailService.sendPasswordResetSms(event);
  }

  @EventPattern(MAIL_SERVICE_PATTERNS.ORDER_CREATED)
  async sendOrderCreatedNotification(@Payload() event: OrderMailEventDto) {
    await this.mailService.sendOrderCreatedNotification(event);
  }

  @EventPattern(MAIL_SERVICE_PATTERNS.ORDER_UPDATED)
  async sendOrderUpdatedNotification(@Payload() event: OrderMailEventDto) {
    await this.mailService.sendOrderUpdatedNotification(event);
  }

  @EventPattern(MAIL_SERVICE_PATTERNS.ORDER_CANCELED)
  async sendOrderCanceledNotification(@Payload() event: OrderMailEventDto) {
    await this.mailService.sendOrderCanceledNotification(event);
  }
}
