import { Entity } from 'typeorm';

export class PasswordResetRequestedEvent {
  eventId: string;
  userId: string;
  email: string;
  resetUrl: string;
  requestedAt: string;
}
