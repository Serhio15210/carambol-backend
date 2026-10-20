import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';

// Одна строка = одна сессия = один залогиненный девайс.
// Пользователь вошёл с телефона и с ноутбука — у него две сессии.
@Entity('auth_sessions')
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // onDelete: 'CASCADE' — при удалении пользователя его сессии удалятся вместе с ним.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Index()
  @Column()
  userId: string;

  // Храним НЕ сам refresh-токен, а его SHA-256 хеш.
  // Если базу украдут, по хешам войти не получится.
  @Column({ unique: true })
  refreshTokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', nullable: true })
  ip: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
