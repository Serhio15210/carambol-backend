import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendSmsInput, SmsProvider } from '@/integrations/sms/sms-provider.interface';

@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  constructor(private readonly config: ConfigService) {}

  async sendSms(input: SendSmsInput): Promise<void> {
    const accountSid = this.config.getOrThrow<string>('sms.twilioAccountSid');
    const authToken = this.config.getOrThrow<string>('sms.twilioAuthToken');
    const from = this.config.getOrThrow<string>('sms.twilioFromPhone');
    const body = new URLSearchParams({
      From: from,
      To: input.to,
      Body: input.text,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Twilio SMS failed with ${response.status}: ${errorBody}`);
    }
  }
}
