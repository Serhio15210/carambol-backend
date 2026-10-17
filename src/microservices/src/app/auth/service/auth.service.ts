import { Injectable, UnauthorizedException } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { AuthResponse } from '@/entities/auth/interfaces/auth.interface';
import { UserBaseRepository } from '@/entities/users/repository/user-base.repository';
import { SessionService } from '@/microservices/src/app/auth/service/session.service';
import {
  LoginWithSessionMetadataDto,
  RegisterWithSessionMetadataDto,
} from '@/microservices/src/app/auth/dto/auth-session-payload.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userBaseRepository: UserBaseRepository,
    private readonly sessionService: SessionService,
  ) {}
  async login(data: LoginWithSessionMetadataDto): Promise<AuthResponse> {
    const login = data.login.trim();
    const user = await this.userBaseRepository.getUserByLogin(login);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordOk = await compare(data.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.sessionService.createSession(user, data.metadata);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        userName: user.userName,
        phone: user.phone,
        role: user.role,
      },
    };
  }
  async register(data: RegisterWithSessionMetadataDto): Promise<AuthResponse> {
    const existingUser = await this.userBaseRepository.getUserByCredentials({
      email: data.email,
      phone: data.phone,
      userName: data.userName,
    });
    if (existingUser) {
      throw new UnauthorizedException('User already exists');
    }
    const passwordHash = await hash(data.password, 10);
    const user = await this.userBaseRepository.createUser({
      ...data,
      passwordHash,
    });

    const tokens = await this.sessionService.createSession(user, data.metadata);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        userName: user.userName,
        phone: user.phone,
        role: user.role,
      },
    };
  }
}
