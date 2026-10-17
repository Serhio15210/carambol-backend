import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { User } from '@/entities/users/model/user.entity';

@Injectable()
export class UserBaseRepository {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}
  async getUserById(id: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: [{ id }],
    });
  }
  async getUserByLogin(login: string): Promise<User | null> {
    return await this.usersRepository.findOne({
      where: [{ email: login }, { userName: login }, { phone: login }],
    });
  }
  async getUserByCredentials(data: {
    email?: string;
    userName?: string;
    phone?: string;
  }): Promise<User | null> {
    const where: FindOptionsWhere<User>[] = [];

    if (data.email) {
      where.push({ email: data.email });
    }
    if (data.userName) {
      where.push({ userName: data.userName });
    }
    if (data.phone) {
      where.push({ phone: data.phone });
    }
    if (where.length === 0) {
      return null;
    }

    return await this.usersRepository.findOne({
      where,
    });
  }
  createUser(user: {
    email?: string;
    userName: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    passwordHash: string;
  }): Promise<User> {
    const newUser = this.usersRepository.create(user);
    return this.usersRepository.save(newUser);
  }
}
