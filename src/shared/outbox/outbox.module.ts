import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutboxEvent } from '@/shared/outbox/model/outbox-event.entity';
import { OutboxService } from '@/shared/outbox/service/outbox.service';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
