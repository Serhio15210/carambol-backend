import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditAction } from '../types/audit-action.enum';

// One row = one administrative action: WHO did WHAT to WHOM and WHEN.
// No foreign keys to users on purpose: the journal must outlive the users it mentions
// and must never be changed or deleted by cascades.
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  actorId: string;

  @Column({ type: 'varchar' })
  action: AuditAction;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
