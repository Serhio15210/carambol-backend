import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '@/common/types/paginated-response.type';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { UserRole } from './types/user-role.enum';

export type CreateUserInput = {
  userName: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  passwordHash: string;
};

// Сервис — это бизнес-логика модуля. Контроллер только принимает HTTP-запрос
// и передаёт данные сюда, а сервис решает, что с ними делать.
// UsersService — публичный API модуля Users: другие модули (например, Auth)
// работают с пользователями только через него, а не лезут в таблицу напрямую.
@Injectable()
export class UsersService {
  constructor(
    // Repository<User> — готовый от TypeORM объект с методами find/save/delete
    // для таблицы users. Nest создаёт его и передаёт в конструктор (Dependency Injection).
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  // Returns null when the user does not exist (used by JwtStrategy on every request).
  findOneById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async findById(id: string): Promise<User> {
    const user = await this.findOneById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  // Ищем по email, userName или телефону. Это единственный метод,
  // который возвращает passwordHash: он нужен модулю Auth для проверки пароля.
  findByLoginWithPassword(login: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :login OR user.userName = :login OR user.phone = :login', { login })
      .getOne();
  }

  // Заранее проверять уникальность email/phone не нужно: это гарантирует
  // UNIQUE-индекс в БД, а DatabaseExceptionFilter превратит ошибку в 409.
  create(input: CreateUserInput): Promise<User> {
    const user = this.usersRepository.create(input);
    return this.usersRepository.save(user);
  }

  async updateProfile(id: string, data: UpdateProfileDto): Promise<User> {
    const user = await this.findById(id);
    this.usersRepository.merge(user, data);
    return this.usersRepository.save(user);
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    const user = await this.findById(id);
    user.role = role;
    return this.usersRepository.save(user);
  }

  async findAll(query: GetUsersQueryDto): Promise<PaginatedResponse<User>> {
    const { page, limit, search } = query;

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      // :search — параметр запроса. TypeORM подставит значение безопасно,
      // поэтому SQL-инъекция невозможна (никогда не склеивай SQL строками!).
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('user.userName ILIKE :search')
            .orWhere('user.email ILIKE :search')
            .orWhere('user.phone ILIKE :search')
            .orWhere('user.firstName ILIKE :search')
            .orWhere('user.lastName ILIKE :search');
        }),
        { search: `%${search}%` },
      );
    }

    const [users, total] = await qb.getManyAndCount();
    return paginate(users, total, page, limit);
  }
}
