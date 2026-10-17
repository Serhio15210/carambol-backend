import { Inject, Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  OrderMailEventDto,
  PasswordResetRequestedEventDto,
} from '@/microservices/src/app/mail/dto/mail.dto';
import { ConfigService } from '@nestjs/config';
import { SMS_PROVIDER } from '@/integrations/sms/tokens';
import { SmsProvider } from '@/integrations/sms/sms-provider.interface';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly config: ConfigService,
    @Inject(SMS_PROVIDER)
    private readonly smsProvider: SmsProvider,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('smtp.host'),
      port: this.config.getOrThrow<number>('smtp.port'),
      secure: false,
      auth: {
        user: this.config.getOrThrow<string>('smtp.user'),
        pass: this.config.getOrThrow<string>('smtp.password'),
      },
    });
  }

  async sendPasswordResetEmail(event: PasswordResetRequestedEventDto) {
    if (!event.email || !event.resetUrl) {
      throw new Error('Email and reset URL are required for password reset email');
    }

    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('smtp.from'),
      to: event.email,
      subject: 'Password Reset Request',
      html: `
        <p>You requested password reset.</p>
        <p><a href="${event.resetUrl}">Reset password</a></p>
        <p>This link expires soon.</p>
      `,
    });
    return;
  }

  async sendPasswordResetSms(event: PasswordResetRequestedEventDto) {
    if (!event.phone || !event.otpCode) {
      throw new Error('Phone and OTP code are required for password reset SMS');
    }

    await this.smsProvider.sendSms({
      to: event.phone,
      text: `Your password reset code: ${event.otpCode}`,
    });
  }

  async sendOrderCreatedNotification(event: OrderMailEventDto) {
    if (!event.email) {
      await this.sendOrderSms(event, 'created');
      return;
    }

    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('smtp.from'),
      to: event.email,
      subject: 'Order created',
      html: `
        <p>Hello ${event.userName}, your order has been created.</p>
        <p><strong>Order:</strong> ${event.orderId}</p>
        <p><strong>Tables:</strong> ${event.tableNames.join(', ')}</p>
        <p><strong>Starts:</strong> ${event.startsAt}</p>
        <p><strong>Ends:</strong> ${event.endsAt}</p>
        <p><strong>Total:</strong> $${event.totalAmount}</p>
      `,
    });
  }

  async sendOrderUpdatedNotification(event: OrderMailEventDto) {
    if (!event.email) {
      await this.sendOrderSms(event, 'updated');
      return;
    }

    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('smtp.from'),
      to: event.email,
      subject: 'Order updated',
      html: `
        <p>Hello ${event.userName}, your order has been updated.</p>
        <p><strong>Order:</strong> ${event.orderId}</p>
        <p><strong>Tables:</strong> ${event.tableNames.join(', ')}</p>
        <p><strong>Starts:</strong> ${event.startsAt}</p>
        <p><strong>Ends:</strong> ${event.endsAt}</p>
        <p><strong>Total:</strong> $${event.totalAmount}</p>
      `,
    });
  }

  async sendOrderCanceledNotification(event: OrderMailEventDto) {
    if (!event.email) {
      await this.sendOrderSms(event, 'canceled');
      return;
    }

    await this.transporter.sendMail({
      from: this.config.getOrThrow<string>('smtp.from'),
      to: event.email,
      subject: 'Order canceled',
      html: `
        <p>Hello ${event.userName}, your order has been canceled.</p>
        <p><strong>Order:</strong> ${event.orderId}</p>
        <p><strong>Tables:</strong> ${event.tableNames.join(', ')}</p>
        <p><strong>Starts:</strong> ${event.startsAt}</p>
        <p><strong>Ends:</strong> ${event.endsAt}</p>
        <p><strong>Total:</strong> $${event.totalAmount}</p>
      `,
    });
  }

  private async sendOrderSms(event: OrderMailEventDto, action: 'created' | 'updated' | 'canceled') {
    if (!event.phone) {
      throw new Error('Email or phone is required for order notification');
    }

    await this.smsProvider.sendSms({
      to: event.phone,
      text: `Your order ${event.orderId} has been ${action}. Tables: ${event.tableNames.join(', ')}. Time: ${event.startsAt} - ${event.endsAt}. Total: $${event.totalAmount}.`,
    });
  }
}
