import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../types/user-role.enum';

// Entity — это класс, который TypeORM превращает в таблицу.
// Один экземпляр класса = одна строка таблицы "users".
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userName: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  // Тип колонки указан явно: TypeORM не умеет сам выводить тип из `string | null`.
  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ unique: true })
  phone: string;

  // select: false — по умолчанию колонка НЕ попадает в SELECT.
  // Так хеш пароля не утечёт в ответ API, даже если кто-то вернёт entity целиком.
  // Когда хеш действительно нужен (логин), его запрашивают явно через addSelect.
  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
