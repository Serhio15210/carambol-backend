import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { RequestUser } from '../types/request-user.type';

// В Express ты писал бы req.user. В Nest достаём его декоратором,
// чтобы контроллер получал готовый типизированный объект:
//   getMe(@CurrentUser() user: RequestUser)
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const request = context.switchToHttp().getRequest<Request & { user: RequestUser }>();
    return request.user;
  },
);
