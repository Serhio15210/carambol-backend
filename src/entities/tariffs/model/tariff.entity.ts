import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserTariffEntity } from '@/entities/tariffs/model/user-tariff.entity';

export enum TariffType {
  BASIC = 'basic',
  PREMIUM = 'premium',
  VIP = 'vip',
}
export enum TariffStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
  HIDDEN = 'hidden',
}
@Entity('tariffs')
export class TariffEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToMany(() => UserTariffEntity, (userTariff) => userTariff.tariff)
  userTariffs: UserTariffEntity[];

  @Column()
  name: string;

  @Column({ type: 'int' })
  price: number;

  @Column({ type: 'int' })
  validityDays: number;

  @Column({ type: 'int', nullable: true })
  dailyLimitMinutes: number | null;

  @Column({ type: 'int', nullable: true })
  discountPrice: number | null;

  @Column({ type: 'enum', enum: TariffType, default: TariffType.BASIC })
  type: TariffType;

  @Column({ type: 'enum', enum: TariffStatus, default: TariffStatus.ACTIVE })
  status: TariffStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
