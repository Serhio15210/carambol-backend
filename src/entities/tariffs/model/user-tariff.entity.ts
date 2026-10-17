import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '@/entities/users/model/user.entity';
import { TariffEntity } from '@/entities/tariffs/model/tariff.entity';

export enum UserTariffStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELED = 'canceled',
}

@Entity('user_tariffs')
export class UserTariffEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.userTariffs)
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => TariffEntity, (tariff) => tariff.userTariffs)
  tariff: TariffEntity;

  @Column()
  tariffId: string;

  @Column({ type: 'enum', enum: UserTariffStatus, default: UserTariffStatus.ACTIVE })
  status: UserTariffStatus;

  @Column({ type: 'int' })
  pricePaid: number;

  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
