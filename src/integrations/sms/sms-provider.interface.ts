export type SendSmsInput = {
  to: string;
  text: string;
};

export interface SmsProvider {
  sendSms(input: SendSmsInput): Promise<void>;
}
