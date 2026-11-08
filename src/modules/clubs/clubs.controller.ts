import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { Auth } from '@/modules/auth/decorators/auth.decorator';
import { NearbyClubsQueryDto } from './dto/nearby-clubs-query.dto';
import { ClubsService } from './clubs.service';

// Read-only for any logged-in user. Changes live in AdminClubsController.
@Auth()
@ApiTags('clubs')
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  // GET /api/v1/clubs?page=1&limit=20
  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.clubsService.findAll(query);
  }

  // Static routes such as 'nearby' must be declared ABOVE ':id', otherwise the word "nearby"
  // is read as an id (and ParseUUIDPipe answers 400).
  // GET /api/v1/clubs/nearby?lat=50.45&lng=30.52&radiusKm=10&page=1&limit=20
  @Get('nearby')
  findNearby(@Query() query: NearbyClubsQueryDto) {
    return this.clubsService.findNearby(query);
  }

  // GET /api/v1/clubs/:id
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clubsService.findById(id);
  }
}
