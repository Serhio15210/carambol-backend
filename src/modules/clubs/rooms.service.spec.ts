import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { Actor } from '@/modules/users/users.service';
import { ClubsService } from './clubs.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { Room } from './entities/room.entity';
import { RoomsService } from './rooms.service';

// In-memory stand-in for Repository<Room>. save() writes the generated id into the SAME object
// it receives, like TypeORM. findOneBy() matches EVERY key it is given (id AND clubId).
class FakeRoomsRepository {
  rows: Room[] = [];
  private nextId = 1;

  create = (data: Partial<Room>) => ({ ...data }) as Room;

  merge = (target: Room, data: Partial<Room>) => Object.assign(target, data);

  save = (room: Room) => {
    const row = { ...room, id: room.id ?? `r${this.nextId++}` };
    this.rows = [...this.rows.filter((r) => r.id !== row.id), { ...row }];
    return Promise.resolve(Object.assign(room, row));
  };

  findOneBy = (where: Partial<Room>) => {
    const row = this.rows.find((r) =>
      Object.entries(where).every(([key, value]) => r[key as keyof Room] === value),
    );
    return Promise.resolve(row ? { ...row } : null);
  };

  find = ({ where, order }: { where?: Partial<Room>; order?: { name?: string } }) => {
    const rows = this.rows.filter((r) =>
      Object.entries(where ?? {}).every(([key, value]) => r[key as keyof Room] === value),
    );
    const sorted = order?.name ? [...rows].sort((a, b) => a.name.localeCompare(b.name)) : rows;
    return Promise.resolve(sorted.map((r) => ({ ...r })));
  };

  delete = (id: string) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return Promise.resolve({ affected: before - this.rows.length });
  };

  seed(data: Partial<Room>) {
    const row = {
      id: `seed${this.nextId++}`,
      clubId: 'club-a',
      name: 'Main hall',
      widthCm: 1000,
      lengthCm: 800,
      ...data,
    } as Room;
    this.rows.push(row);
    return row;
  }
}

const actor: Actor = { id: 'admin', role: UserRole.ADMIN };

const newRoom = (extra: Partial<CreateRoomDto> = {}): CreateRoomDto => ({
  name: 'Main hall',
  widthCm: 1000,
  lengthCm: 800,
  ...extra,
});

describe('RoomsService', () => {
  let repo: FakeRoomsRepository;
  let service: RoomsService;
  const record = jest.fn();
  // The only club method the rooms service may call: it answers 404 for the club "ghost-club".
  const findClub = jest.fn();

  beforeEach(() => {
    record.mockReset().mockResolvedValue(undefined);
    findClub
      .mockReset()
      .mockImplementation((id: string) =>
        id === 'ghost-club' ? Promise.reject(new NotFoundException()) : Promise.resolve({ id }),
      );
    repo = new FakeRoomsRepository();
    service = new RoomsService(
      repo as unknown as Repository<Room>,
      { findById: findClub } as unknown as ClubsService,
      { record } as unknown as AuditService,
    );
  });

  describe('findAllByClub (provided)', () => {
    it('lists only the rooms of this club, sorted by name', async () => {
      repo.seed({ clubId: 'club-a', name: 'VIP' });
      repo.seed({ clubId: 'club-a', name: 'Annex' });
      repo.seed({ clubId: 'club-b', name: 'Other club room' });

      const rooms = await service.findAllByClub('club-a');

      expect(rooms.map((r) => r.name)).toEqual(['Annex', 'VIP']);
    });

    it('returns 404 for an unknown club instead of an empty list', async () => {
      await expect(service.findAllByClub('ghost-club')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findInClub (your part)', () => {
    it('returns the room when it belongs to the club', async () => {
      const room = repo.seed({ clubId: 'club-a' });

      await expect(service.findInClub('club-a', room.id)).resolves.toMatchObject({ id: room.id });
    });

    it('returns 404 when the room belongs to ANOTHER club', async () => {
      const room = repo.seed({ clubId: 'club-a' });

      await expect(service.findInClub('club-b', room.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 404 when the room does not exist', async () => {
      await expect(service.findInClub('club-a', 'ghost-room')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create (your part)', () => {
    it('creates a room in the club and writes an audit entry with the saved id', async () => {
      const room = await service.create(actor, 'club-a', newRoom());

      expect(room).toMatchObject({ clubId: 'club-a', name: 'Main hall', widthCm: 1000 });
      expect(room.id).toBeDefined();
      expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.RoomCreate, room.id]);
    });

    it('returns 404 for an unknown club and saves nothing (not a foreign key error)', async () => {
      await expect(service.create(actor, 'ghost-club', newRoom())).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.rows).toHaveLength(0);
      expect(record).not.toHaveBeenCalled();
    });
  });

  describe('update and remove (provided, they use findInClub)', () => {
    it('update changes only the fields that were sent and writes an audit entry', async () => {
      const room = repo.seed({ clubId: 'club-a', name: 'Hall', widthCm: 1000 });

      const updated = await service.update(actor, 'club-a', room.id, { widthCm: 1200 });

      expect(updated).toMatchObject({ id: room.id, name: 'Hall', widthCm: 1200 });
      expect((await service.findInClub('club-a', room.id)).widthCm).toBe(1200);
      expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.RoomUpdate, room.id]);
    });

    it('update refuses a room of another club', async () => {
      const room = repo.seed({ clubId: 'club-a' });

      await expect(
        service.update(actor, 'club-b', room.id, { name: 'Hacked' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.rows[0].name).toBe('Main hall');
    });

    it('remove deletes the room and writes an audit entry', async () => {
      const room = repo.seed({ clubId: 'club-a' });

      await service.remove(actor, 'club-a', room.id);

      expect(repo.rows).toHaveLength(0);
      expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.RoomDelete, room.id]);
    });

    it('remove writes no audit entry when the database refuses (tables exist)', async () => {
      const room = repo.seed({ clubId: 'club-a' });
      repo.delete = () => Promise.reject(new Error('foreign key violation'));

      await expect(service.remove(actor, 'club-a', room.id)).rejects.toThrow('foreign key');
      expect(record).not.toHaveBeenCalled();
    });

    it('remove refuses a room of another club', async () => {
      const room = repo.seed({ clubId: 'club-a' });

      await expect(service.remove(actor, 'club-b', room.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repo.rows).toHaveLength(1);
    });
  });
});
