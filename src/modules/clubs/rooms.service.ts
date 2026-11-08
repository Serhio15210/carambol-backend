import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { Actor } from '@/modules/users/users.service';
import { ClubsService } from './clubs.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { Room } from './entities/room.entity';

// Rooms live inside a club: every method takes the clubId from the URL and works only with
// rooms of THAT club.
@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room)
    private readonly roomsRepository: Repository<Room>,
    private readonly clubs: ClubsService,
    private readonly audit: AuditService,
  ) {}

  // shortcut: no pagination, a club has a handful of rooms; add it if that ever changes.
  async findAllByClub(clubId: string): Promise<Room[]> {
    await this.clubs.findById(clubId); // 404 for an unknown club instead of an empty list
    return this.roomsRepository.find({ where: { clubId }, order: { name: 'ASC' } });
  }

  // The room only if it belongs to THIS club: a room of another club looks exactly like a missing one.
  async findInClub(clubId: string, roomId: string): Promise<Room> {
    const room = await this.roomsRepository.findOneBy({ id: roomId, clubId });
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    return room;
  }

  // A room together with its club: tables need the room size and the club's passage (minGapCm).
  async findRoomWithClub(roomId: string): Promise<Room> {
    const room = await this.roomsRepository.findOne({
      where: { id: roomId },
      relations: { club: true },
    });
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }
    return room;
  }

  // The club is checked BEFORE saving: for a missing club the foreign key would fail with code 23503,
  // which the filter maps to 409 "referenced by other records", the wrong message here.
  async create(actor: Actor, clubId: string, dto: CreateRoomDto): Promise<Room> {
    const club = await this.clubs.findById(clubId);
    const room = this.roomsRepository.create({ ...dto, clubId: club.id });
    const saved = await this.roomsRepository.save(room);
    await this.audit.record(actor.id, AuditAction.RoomCreate, saved.id);
    return saved;
  }

  async update(actor: Actor, clubId: string, roomId: string, dto: UpdateRoomDto): Promise<Room> {
    const room = await this.findInClub(clubId, roomId);
    this.roomsRepository.merge(room, dto);
    const saved = await this.roomsRepository.save(room);
    await this.audit.record(actor.id, AuditAction.RoomUpdate, roomId, {
      fields: Object.keys(dto),
    });
    return saved;
  }

  // A real delete: tables will reference the room (foreign key RESTRICT), so a room with tables
  // is refused by PostgreSQL (409) and nothing is audited.
  async remove(actor: Actor, clubId: string, roomId: string): Promise<void> {
    await this.findInClub(clubId, roomId);
    await this.roomsRepository.delete(roomId);
    await this.audit.record(actor.id, AuditAction.RoomDelete, roomId);
  }
}
