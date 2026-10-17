import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientKafka } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Interval } from '@nestjs/schedule';
import { OutboxEvent } from '@/shared/outbox/model/outbox-event.entity';
import { MICROSERVICE_CLIENTS } from '@/microservices/src/shared/injected-tokens';

@Injectable()
export class OutboxPublisherService {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly maxAttempts = 5;
  private isPublishing = false;
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,

    @Inject(MICROSERVICE_CLIENTS.MAIL)
    private readonly kafkaClient: ClientKafka,
  ) {}

  @Interval(5000)
  async publishPendingEvents() {
    if (this.isPublishing) {
      return;
    }

    this.isPublishing = true;

    try {
      const events = await this.outboxRepository.find({
        where: { status: 'pending' },
        order: { createdAt: 'ASC' },
        take: 50,
      });

      for (const event of events) {
        await this.publishEvent(event);
      }
    } finally {
      this.isPublishing = false;
    }
  }

  private async publishEvent(event: OutboxEvent) {
    try {
      await firstValueFrom(this.kafkaClient.emit(event.topic, event.payload));

      event.status = 'published';
      event.publishedAt = new Date();
      event.lastError = null;

      await this.outboxRepository.save(event);
    } catch (error) {
      event.attempts += 1;
      event.lastError = error instanceof Error ? error.message : String(error);

      if (event.attempts >= this.maxAttempts) {
        event.status = 'failed';
      }

      await this.outboxRepository.save(event);
    }
  }
}
