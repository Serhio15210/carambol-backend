import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '@/entities/users/model/user.entity';
import { PasswordResetChannel } from '@/microservices/src/app/auth/dto/reset-user-password.dto';

@Entity('auth_reset')
export class AuthReset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'varchar' })
  channel: PasswordResetChannel;

  @Column()
  target: string;

  @Column({ nullable: true })
  tokenHash: string | null;

  @Column({ unique: true, nullable: true })
  otpCodeHash: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
