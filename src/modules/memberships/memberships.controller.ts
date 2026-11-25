import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { StartMembershipDto } from './dto/start-membership.dto';
import { MembershipsService } from './memberships.service';

// A logged-in user buys a membership for themselves: the owner comes from the token, never from the body.
@Auth()
@ApiTags('memberships')
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  // POST /api/v1/memberships  { planId } -> 201 { membershipId, url }: open `url` to pay at Stripe.
  // 404 for a plan that is not on sale, 409 when the user already has a live membership in that club.
  @Post()
  start(@CurrentUser() user: RequestUser, @Body() dto: StartMembershipDto) {
    return this.membershipsService.start(user.id, dto.planId);
  }

  // PATCH /api/v1/memberships/:id/cancel  -> 200 { membershipId, activeUntil } (a user may have one per club)
  // Stops the renewals; the discount stays until activeUntil (the paid month is not taken away).
  // 404 when there is nothing to cancel. A verb in the path: cancelling is an action (like orders).
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.membershipsService.cancel(user.id, id);
  }
}
