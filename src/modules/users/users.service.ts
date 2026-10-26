import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { paginate, PaginatedResponse } from '@/common/types/paginated-response.type';
import { hashPassword } from '@/common/security/password';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { User } from './entities/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { CreateUserByAdminDto } from './dto/create-user-by-admin.dto';
import { UserRole } from './types/user-role.enum';
import { PublicUser, toPublicUser } from './types/public-user.type';

export type CreateUserInput = {
  userName: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  passwordHash: string;
  role?: UserRole;
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
    private readonly audit: AuditService,
  ) {}

  // Returns null when the user does not exist (used by JwtStrategy on every request).
  // Soft-deleted users are never found: TypeORM adds "deletedAt IS NULL" automatically.
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
  // UNIQUE-индекс в БД, а фильтр ошибок превратит нарушение в 409.
  create(input: CreateUserInput): Promise<User> {
    const user = this.usersRepository.create(input);
    return this.usersRepository.save(user);
  }

  async updateProfile(id: string, data: UpdateProfileDto): Promise<User> {
    const user = await this.findById(id);
    this.usersRepository.merge(user, data);
    return this.usersRepository.save(user);
  }

  // ---------- admin operations: each one leaves an entry in the audit log ----------

  // Returns a PUBLIC user: the freshly saved entity still holds passwordHash in memory,
  // and select: false only protects rows that are read from the database.
  async createByAdmin(actorId: string, dto: CreateUserByAdminDto): Promise<PublicUser> {
    const { password, ...profile } = dto;
    const user = await this.create({ ...profile, passwordHash: await hashPassword(password) });
    await this.audit.record(actorId, AuditAction.UserCreate, user.id, { role: user.role });
    return toPublicUser(user);
  }

  async updateByAdmin(actorId: string, id: string, data: UpdateProfileDto): Promise<User> {
    const user = await this.updateProfile(id, data);
    await this.audit.record(actorId, AuditAction.UserUpdate, id, { fields: Object.keys(data) });
    return user;
  }

  async updateRole(actorId: string, id: string, role: UserRole): Promise<User> {
    this.assertNotSelf(actorId, id, 'change your own role');
    const user = await this.findById(id);
    const previousRole = user.role;
    user.role = role;
    const saved = await this.usersRepository.save(user);
    await this.audit.record(actorId, AuditAction.UserRoleChange, id, {
      from: previousRole,
      to: role,
    });
    return saved;
  }

  // TODO(human): implement blocking and unblocking (see the lesson task in chat and users.service.spec.ts).
  // Rename the unused parameters (_actorId, _targetId, _blocked) once you use them.
  async setBlocked(actorId: string, targetId: string, blocked: boolean): Promise<User> {
    this.assertNotSelf(actorId, targetId, 'block your own account here');
    const user = await this.findOneById(targetId);
    if (!user) {
      throw new NotFoundException(`User ${targetId} not found`);
    }

    const isBlocked = user.blockedAt !== null;
    if (isBlocked === blocked) {
      throw new ConflictException(`User is already ${blocked ? 'blocked' : 'unblocked'}`);
    }
    user.blockedAt = blocked ? new Date() : null;
    const updateUser = await this.usersRepository.save(user);
    await this.audit.record(
      actorId,
      blocked ? AuditAction.UserBlock : AuditAction.UserUnblock,
      targetId,
      { blocked },
    );
    return updateUser;
  }

  async softDelete(actorId: string, id: string): Promise<void> {
    this.assertNotSelf(actorId, id, 'delete your own account here');
    await this.findById(id);
    await this.usersRepository.softDelete(id);
    await this.audit.record(actorId, AuditAction.UserDelete, id);
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

  // An admin must not lock themselves out (own role changed, own account blocked or deleted).
  private assertNotSelf(actorId: string, targetId: string, action: string): void {
    if (actorId === targetId) {
      throw new ForbiddenException(`You cannot ${action}`);
    }
  }
}
