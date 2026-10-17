import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './service/users.service';
import { User } from '@/entities/users/model/user.entity';
import { UserBaseRepository } from '@/entities/users/repository/user-base.repository';
import { UserProfileController } from '@/entities/users/controller/user-profile.controller';
import { AdminUsersController } from '@/entities/users/controller/admin-users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserProfileController, AdminUsersController],
  providers: [UsersService, UserBaseRepository],
  exports: [TypeOrmModule],
})
export class UsersModule {}
