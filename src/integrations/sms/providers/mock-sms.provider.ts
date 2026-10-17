import { Injectable, Logger } from '@nestjs/common';
import { SendSmsInput, SmsProvider } from '@/integrations/sms/sms-provider.interface';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);

  async sendSms(input: SendSmsInput): Promise<void> {
    this.logger.log(`Mock SMS sent to ${input.to}: ${input.text}`);
  }
}
