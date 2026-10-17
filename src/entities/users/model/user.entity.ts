import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { OrderEntity } from '@/entities/orders/model/order.entity';
import { UserTariffEntity } from '@/entities/tariffs/model/user-tariff.entity';
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @OneToMany(() => OrderEntity, (order) => order.user)
  orders: OrderEntity[];

  @OneToMany(() => UserTariffEntity, (userTariff) => userTariff.user)
  userTariffs: UserTariffEntity[];

  @Column({ unique: true })
  userName: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ unique: true, nullable: true })
  email: string | null;

  @Column({ unique: true })
  phone: string;

  @Column()
  passwordHash: string;

  @Column({ default: 0 })
  attendanceCount: number;
}
