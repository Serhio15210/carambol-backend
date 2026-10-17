import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { OrderEntity } from '@/entities/orders/model/order.entity';

export enum TableColor {
  GREEN = 'green',
  RED = 'red',
  BLUE = 'blue',
}

export enum TableStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  MAINTENANCE = 'maintenance',
  HIDDEN = 'hidden',
}

export enum TableType {
  POOL = 'pool',
  SNOOKER = 'snooker',
  RUSSIAN = 'russian',
}

@Entity('tables')
export class TableEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToMany(() => OrderEntity, (order) => order.tables)
  orders: OrderEntity[];

  @Column({ unique: true })
  name: string;

  @Column({ type: 'int', default: 0 })
  capacity: number;

  @Column({ type: 'int', default: 0 })
  pricePerHour: number;

  @Column({ type: 'int', default: 0 })
  height: number;

  @Column({ type: 'int', default: 0 })
  width: number;

  @Column({ type: 'int', default: 0 })
  length: number;

  @Column({ nullable: true })
  imageUrl: string | null;

  @Column({ type: 'enum', enum: TableColor, default: TableColor.GREEN })
  color: TableColor;

  @Column({ type: 'enum', enum: TableStatus, default: TableStatus.AVAILABLE })
  status: TableStatus;

  @Column({ type: 'enum', enum: TableType, default: TableType.POOL })
  type: TableType;
}
