import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { paginate, PaginatedResponse } from '@/common/types/paginated-response.type';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { Actor } from '@/modules/users/users.service';
import { CreateClubDto } from './dto/create-club.dto';
import { NearbyClubsQueryDto } from './dto/nearby-clubs-query.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { Club } from './entities/club.entity';
import geolib from 'geolib';

// A club together with its distance from the searched point, in kilometers.
export type NearbyClub = Club & { distanceKm: number };

@Injectable()
export class ClubsService {
  constructor(
    @InjectRepository(Club)
    private readonly clubsRepository: Repository<Club>,
    private readonly audit: AuditService,
  ) {}

  async findAll({ page, limit }: PaginationQueryDto): Promise<PaginatedResponse<Club>> {
    // Names are not unique, so id breaks ties: without a stable order pages could repeat rows.
    const [clubs, total] = await this.clubsRepository.findAndCount({
      order: { name: 'ASC', id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(clubs, total, page, limit);
  }

  async findById(id: string): Promise<Club> {
    const club = await this.clubsRepository.findOneBy({ id });
    if (!club) {
      throw new NotFoundException(`Club ${id} not found`);
    }
    return club;
  }

  async create(actor: Actor, dto: CreateClubDto): Promise<Club> {
    const club = await this.clubsRepository.save(this.clubsRepository.create(dto));
    await this.audit.record(actor.id, AuditAction.ClubCreate, club.id);
    return club;
  }

  // Only the fields that were sent change (merge); the audit entry follows a successful save.
  async update(actor: Actor, id: string, dto: UpdateClubDto): Promise<Club> {
    const club = await this.findById(id);
    this.clubsRepository.merge(club, dto);
    const saved = await this.clubsRepository.save(club);
    await this.audit.record(actor.id, AuditAction.ClubUpdate, club.id);
    return saved;
  }

  // A real delete. findById first: DELETE of a missing id is not an error in SQL (0 rows), but must be a 404.
  // Once rooms exist, PostgreSQL refuses to delete a club that has them (foreign key) and the exception
  // filter answers 409; the audit entry is written only after the delete went through.
  async remove(actor: Actor, id: string): Promise<void> {
    const club = await this.findById(id);
    await this.clubsRepository.delete(club.id);
    await this.audit.record(actor.id, AuditAction.ClubDelete, id);
  }

  // One page of the clubs within radiusKm of (lat, lng), nearest first, each with distanceKm;
  // meta.total = how many clubs are inside the circle (not the box, not the table).
  // shortcut: every club inside the box is loaded, sorted and sliced in Node on each request, and a
  // box that crosses the +-180 degree meridian is not handled; upgrade to earthdistance or PostGIS
  // (distance and paging in SQL) in lesson 30. See clubs.service.spec.ts.
  async findNearby(query: NearbyClubsQueryDto): Promise<PaginatedResponse<NearbyClub>> {
    const center = { latitude: query.lat, longitude: query.lng };
    // 1. Rough filter in the database: the box around the circle (geolib works in meters).
    const bounds = geolib.getBoundsOfDistance(center, query.radiusKm * 1000);
    const clubs = await this.clubsRepository.find({
      where: {
        lat: Between(bounds[0].latitude, bounds[bounds.length - 1].latitude),
        lng: Between(bounds[0].longitude, bounds[bounds.length - 1].longitude),
      },
    });
    // 2. Exact filter in Node: real distance, corners of the box dropped, nearest first.
    const inCircle = clubs
      .map((club) => ({
        ...club,
        distanceKm: geolib.getDistance(center, { latitude: club.lat, longitude: club.lng }) / 1000,
      }))
      .filter((club) => club.distanceKm <= query.radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    // 3. The page is cut only now, after sorting; total counts the whole circle.
    const start = (query.page - 1) * query.limit;
    const items = inCircle.slice(start, start + query.limit);
    return paginate(items, inCircle.length, query.page, query.limit);
  }
}
