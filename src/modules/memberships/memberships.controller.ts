import { Controller, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { MembershipsService } from './memberships.service';

// A logged-in user buys a membership for themselves: the owner comes from the token, never from the body.
@Auth()
@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  // POST /api/v1/memberships  (no body) -> 201 { membershipId, url }: open `url` to pay at Stripe.
  // 409 when the user already has a membership that is not cancelled.
  @Post()
  start(@CurrentUser() user: RequestUser) {
    return this.membershipsService.start(user.id);
  }

  // PATCH /api/v1/memberships/my/cancel  -> 200 { membershipId, activeUntil }
  // Stops the renewals; the discount stays until activeUntil (the paid month is not taken away).
  // 404 when there is nothing to cancel. A verb in the path: cancelling is an action (like orders).
  @Patch('my/cancel')
  cancel(@CurrentUser() user: RequestUser) {
    return this.membershipsService.cancel(user.id);
  }
}
