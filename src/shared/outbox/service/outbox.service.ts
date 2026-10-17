import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { OutboxEvent } from '@/shared/outbox/model/outbox-event.entity';

type CreateOutboxEventInput = {
  topic: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class OutboxService {
  createEvent(manager: EntityManager, input: CreateOutboxEventInput): Promise<OutboxEvent> {
    return manager.save(OutboxEvent, {
      topic: input.topic,
      payload: input.payload,
      status: 'pending',
      attempts: 0,
      lastError: null,
      publishedAt: null,
    });
  }
}
