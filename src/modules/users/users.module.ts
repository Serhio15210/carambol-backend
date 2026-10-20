import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';

// Модуль — граница фичи. Он объявляет:
//  imports     — что ему нужно от других модулей;
//  controllers — какие HTTP-маршруты он обслуживает;
//  providers   — какие классы Nest должен создать и внедрять (сервисы и т.п.);
//  exports     — что из этого он отдаёт наружу другим модулям.
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService],
  // Наружу отдаём только сервис. Repository<User> остаётся внутри модуля,
  // поэтому никто не изменит таблицу users в обход бизнес-логики.
  exports: [UsersService],
})
export class UsersModule {}
