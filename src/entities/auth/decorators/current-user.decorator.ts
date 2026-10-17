import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestUser } from '@/entities/users/interfaces/user.interface';

type AuthenticatedRequest = {
  user: RequestUser;
};

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
