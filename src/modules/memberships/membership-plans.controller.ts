import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { CurrentUser } from '@/modules/auth/decorators/current-user.decorator';
import { RequestUser } from '@/modules/auth/types/request-user.type';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { MembershipPlansService } from './membership-plans.service';

// The plans of one club. @Auth() only says "logged in": WHO may manage THIS club's plans depends on
// the club, so the service decides (a role alone cannot tell club A's manager from club B's).
@ApiTags('membership plans')
@Controller('clubs/:clubId/membership-plans')
export class MembershipPlansController {
  constructor(private readonly plansService: MembershipPlansService) {}

  // GET /api/v1/clubs/:clubId/membership-plans -> the plans on sale, cheapest first (no login: a shop window)
  @Get()
  findOnSale(@Param('clubId', ParseUUIDPipe) clubId: string) {
    return this.plansService.findOnSale(clubId);
  }

  // POST /api/v1/clubs/:clubId/membership-plans  { name, priceCents, discountPercent } -> 201 plan
  @Auth()
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Body() dto: CreateMembershipPlanDto,
  ) {
    return this.plansService.create(user, clubId, dto);
  }

  // DELETE /api/v1/clubs/:clubId/membership-plans/:planId -> 204: the plan leaves the shop window.
  // It is archived, not deleted: existing memberships keep pointing at it.
  @Auth()
  @Delete(':planId')
  @HttpCode(204)
  archive(
    @CurrentUser() user: RequestUser,
    @Param('clubId', ParseUUIDPipe) clubId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.plansService.archive(user, clubId, planId);
  }
}
