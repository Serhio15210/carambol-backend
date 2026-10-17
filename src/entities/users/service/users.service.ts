import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { User as UserEntity, UserRole } from '@/entities/users/model/user.entity';
import { UpdateUserDto } from '@/entities/users/dto/update-user.dto';
import { UserBaseRepository } from '@/entities/users/repository/user-base.repository';
import { GetUsersQueryDto } from '@/entities/users/dto/get-users-query.dto';
import { PaginatedResponse, User as PublicUser } from '@/entities/users/interfaces/user.interface';

const parseUserId = (userId: string): string => {
  const id = userId.trim();
  if (id.length === 0) {
    throw new NotFoundException(`User "${userId}" not found`);
  }
  return id;
};

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly usersBaseRepository: UserBaseRepository,
  ) {}

  async getUsers(query: GetUsersQueryDto): Promise<PaginatedResponse<PublicUser>> {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const search = query.search;

    const usersQuery = this.usersRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.role',
        'user.userName',
        'user.firstName',
        'user.lastName',
        'user.phone',
        'user.attendanceCount',
      ])
      .orderBy('user.userName', 'ASC')
      .skip(skip)
      .take(limit);

    if (search) {
      usersQuery.andWhere(
        new Brackets((builder) => {
          builder
            .where('user.email ILIKE :search', { search: `%${search}%` })
            .orWhere('user.userName ILIKE :search', { search: `%${search}%` })
            .orWhere('user.phone ILIKE :search', { search: `%${search}%` })
            .orWhere('user.firstName ILIKE :search', { search: `%${search}%` })
            .orWhere('user.lastName ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    const [users, total] = await usersQuery.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return {
      items: users.map((user) => this.toPublicUser(user)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
  async getUser(userId: string): Promise<UserEntity | null> {
    const id = parseUserId(userId);
    const user = await this.usersBaseRepository.getUserById(id);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return user;
  }
  async updateUser(userId: string, data: UpdateUserDto): Promise<UserEntity> {
    const id = parseUserId(userId);
    const user = await this.usersBaseRepository.getUserById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    if (data.firstName !== undefined) {
      user.firstName = data.firstName;
    }
    if (data.lastName !== undefined) {
      user.lastName = data.lastName;
    }
    if (data.email !== undefined) {
      user.email = data.email;
    }
    if (data.phone !== undefined) {
      user.phone = data.phone;
    }

    return this.usersRepository.save(user);
  }
  async updateUserRole(userId: string, role: UserRole): Promise<UserEntity> {
    const id = parseUserId(userId);
    const user = await this.usersBaseRepository.getUserById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    if (role !== UserRole.USER && role !== UserRole.ADMIN) {
      throw new NotFoundException(`Role ${role} not found`);
    }
    user.role = role;

    return this.usersRepository.save(user);
  }
  async deleteUser(userId: string): Promise<void> {
    const id = parseUserId(userId);
    const result = await this.usersRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }

  private toPublicUser(user: UserEntity): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      userName: user.userName,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      attendanceCount: user.attendanceCount,
    };
  }
}
