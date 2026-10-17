import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('outbox_events')
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  topic: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'pending' })
  status: 'pending' | 'published' | 'failed';

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
