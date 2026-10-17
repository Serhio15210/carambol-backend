import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockSmsProvider } from '@/integrations/sms/providers/mock-sms.provider';
import { TwilioSmsProvider } from '@/integrations/sms/providers/twilio-sms.provider';
import { SMS_PROVIDER } from '@/integrations/sms/tokens';

@Module({
  providers: [
    MockSmsProvider,
    TwilioSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, TwilioSmsProvider, MockSmsProvider],
      useFactory: (
        config: ConfigService,
        twilioProvider: TwilioSmsProvider,
        mockProvider: MockSmsProvider,
      ) => {
        const provider = config.get<string>('sms.provider');

        if (provider === 'twilio') {
          return twilioProvider;
        }

        return mockProvider;
      },
    },
  ],
  exports: [SMS_PROVIDER],
})
export class SmsModule {}
