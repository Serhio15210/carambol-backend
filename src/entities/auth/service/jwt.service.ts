import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@/entities/users/model/user.entity';
import { JwtPayload } from '@/entities/auth/interfaces/jwt.interface';

@Injectable()
export class JwtTokenService {
  constructor(private readonly jwtService: JwtService) {}

  async createAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      userName: user.userName,
      role: user.role,
    });
  }

  verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync<JwtPayload>(token);
  }
}
