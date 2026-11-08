import { NotFoundException } from '@nestjs/common';
import { FindOperator, Repository } from 'typeorm';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { Actor } from '@/modules/users/users.service';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { CreateClubDto } from './dto/create-club.dto';
import { NearbyClubsQueryDto } from './dto/nearby-clubs-query.dto';
import { Club } from './entities/club.entity';
import { ClubsService } from './clubs.service';

// In-memory stand-in for Repository<Club>. It behaves like TypeORM for the methods the lesson
// contract allows: save() writes the generated id and defaults into the SAME object it receives.
class FakeClubsRepository {
  rows: Club[] = [];
  private nextId = 1;

  create = (data: Partial<Club>) => ({ ...data }) as Club;

  merge = (target: Club, data: Partial<Club>) => Object.assign(target, data);

  save = (club: Club) => {
    const row = { ...club, id: club.id ?? `c${this.nextId++}`, minGapCm: club.minGapCm ?? 150 };
    this.rows = [...this.rows.filter((r) => r.id !== row.id), { ...row }];
    return Promise.resolve(Object.assign(club, row));
  };

  findOneBy = ({ id }: { id: string }) => {
    const row = this.rows.find((r) => r.id === id);
    return Promise.resolve(row ? { ...row } : null);
  };

  findAndCount = ({
    order,
    skip = 0,
    take,
  }: {
    order?: { name?: string };
    skip?: number;
    take?: number;
  }) => {
    // Rows come back in insertion order unless the service asks for an order by name.
    const items = order?.name
      ? [...this.rows].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      : [...this.rows];
    const end = take === undefined ? undefined : skip + take;
    return Promise.resolve([items.slice(skip, end).map((r) => ({ ...r })), items.length]);
  };

  // Understands only what findNearby needs: where: { lat: Between(a, b), lng: Between(c, d) }.
  // Without a where it returns EVERY club, like find() on the real table would.
  // Like the real table it also honours skip/take, applied to the rows in insertion order
  // (a database without ORDER BY gives no promise about the order).
  find = jest.fn(
    ({
      where,
      skip = 0,
      take,
    }: {
      where?: { lat?: FindOperator<number>; lng?: FindOperator<number> };
      skip?: number;
      take?: number;
    } = {}) => {
      const inRange = (value: number, operator?: FindOperator<number>) => {
        if (!operator) return true;
        const [min, max] = operator.value as unknown as [number, number];
        return value >= min && value <= max;
      };
      const found = this.rows.filter(
        (r) => inRange(r.lat, where?.lat) && inRange(r.lng, where?.lng),
      );
      return Promise.resolve(found.slice(skip, take === undefined ? undefined : skip + take));
    },
  );

  delete = (id: string) => {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return Promise.resolve({ affected: before - this.rows.length });
  };

  seed(data: Partial<Club>) {
    const row = {
      id: `seed${this.nextId++}`,
      name: 'Club',
      address: 'Street 1',
      lat: 50.45,
      lng: 30.52,
      minGapCm: 150,
      ...data,
    } as Club;
    this.rows.push(row);
    return row;
  }
}

const actor: Actor = { id: 'admin', role: UserRole.ADMIN };

const newClub = (extra: Partial<CreateClubDto> = {}): CreateClubDto => ({
  name: 'Carambol',
  address: 'Khreshchatyk 1, Kyiv',
  lat: 50.4501,
  lng: 30.5234,
  ...extra,
});

const page = (extra: Partial<PaginationQueryDto> = {}): PaginationQueryDto => ({
  page: 1,
  limit: 20,
  ...extra,
});

describe('ClubsService', () => {
  let repo: FakeClubsRepository;
  let service: ClubsService;
  const record = jest.fn();

  beforeEach(() => {
    record.mockReset().mockResolvedValue(undefined);
    repo = new FakeClubsRepository();
    service = new ClubsService(
      repo as unknown as Repository<Club>,
      {
        record,
      } as unknown as AuditService,
    );
  });

  describe('create, findById, findAll (provided)', () => {
    it('creates a club with an id and the default passage, and writes an audit entry', async () => {
      const club = await service.create(actor, newClub());

      expect(club.id).toBeDefined();
      expect(club.minGapCm).toBe(150);
      expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.ClubCreate, club.id]);
    });

    it('returns 404 for an unknown id', async () => {
      await expect(service.findById('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lists clubs sorted by name and paginated', async () => {
      ['Delta', 'Alpha', 'Charlie', 'Bravo', 'Echo'].forEach((name) => repo.seed({ name }));

      const second = await service.findAll(page({ page: 2, limit: 2 }));

      expect(second.items.map((c) => c.name)).toEqual(['Charlie', 'Delta']);
      expect(second.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    });
  });

  describe('update (your part)', () => {
    it('changes only the fields that were sent', async () => {
      const club = await service.create(actor, newClub());

      const updated = await service.update(actor, club.id, { name: 'Renamed' });

      expect(updated).toMatchObject({ id: club.id, name: 'Renamed', address: club.address });
      expect(updated.lat).toBe(50.4501);
    });

    it('stores the change, not only returns it', async () => {
      const club = await service.create(actor, newClub());

      await service.update(actor, club.id, { minGapCm: 120 });

      expect((await service.findById(club.id)).minGapCm).toBe(120);
    });

    it('writes an audit entry with the club id', async () => {
      const club = await service.create(actor, newClub());
      record.mockClear();

      await service.update(actor, club.id, { name: 'Renamed' });

      expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.ClubUpdate, club.id]);
    });

    it('returns 404 for an unknown club and writes nothing', async () => {
      await expect(service.update(actor, 'ghost', { name: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(record).not.toHaveBeenCalled();
    });
  });

  describe('remove (your part)', () => {
    it('deletes the club for real and writes an audit entry', async () => {
      const club = await service.create(actor, newClub());
      record.mockClear();

      await service.remove(actor, club.id);

      expect(repo.rows).toHaveLength(0);
      expect(record.mock.calls[0].slice(0, 3)).toEqual(['admin', AuditAction.ClubDelete, club.id]);
    });

    it('returns 404 for an unknown club and does not touch the repository', async () => {
      const spy = jest.spyOn(repo, 'delete');

      await expect(service.remove(actor, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(spy).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });

    it('writes no audit entry when the database refuses the delete (rooms exist)', async () => {
      const club = await service.create(actor, newClub());
      record.mockClear();
      repo.delete = () => Promise.reject(new Error('foreign key violation'));

      await expect(service.remove(actor, club.id)).rejects.toThrow('foreign key violation');
      expect(record).not.toHaveBeenCalled();
    });
  });

  // The searched point is the center of Kyiv. Distances (geolib, in km) of the seeded clubs:
  // Center 0, East ~3.5, North ~5.0, Corner ~13.2 (inside the 10 km box, OUTSIDE the 10 km
  // circle), Lviv ~468. Assert distances with a tolerance: libraries use slightly different
  // Earth radii, so never compare them with an exact number.
  describe('findNearby (your part)', () => {
    const kyiv = { lat: 50.4501, lng: 30.5234 };
    const search = (extra: Partial<NearbyClubsQueryDto> = {}): NearbyClubsQueryDto => ({
      ...kyiv,
      radiusKm: 10,
      page: 1,
      limit: 20,
      ...extra,
    });

    beforeEach(() => {
      // inserted in a mixed order on purpose: the result must be sorted by distance
      repo.seed({ name: 'North', lat: 50.4951, lng: 30.5234 });
      repo.seed({ name: 'Lviv', lat: 49.8397, lng: 24.0297 });
      repo.seed({ name: 'Corner', lat: 50.5351, lng: 30.6534 });
      repo.seed({ name: 'Center', lat: 50.4501, lng: 30.5234 });
      repo.seed({ name: 'East', lat: 50.4501, lng: 30.5734 });
    });

    it('returns the clubs inside the radius, nearest first, with the distance in km', async () => {
      const { items: clubs } = await service.findNearby(search());

      expect(clubs.map((c) => c.name)).toEqual(['Center', 'East', 'North']);
      expect(clubs[0].distanceKm).toBeCloseTo(0, 0);
      expect(clubs[1].distanceKm).toBeCloseTo(3.5, 0);
      expect(clubs[2].distanceKm).toBeCloseTo(5, 0);
      expect(clubs[0]).toMatchObject({ name: 'Center', address: 'Street 1' }); // the club's own fields stay
    });

    it('drops a club that is inside the bounding box but outside the circle', async () => {
      const tight = await service.findNearby(search({ radiusKm: 10 }));
      const wide = await service.findNearby(search({ radiusKm: 14 }));

      expect(tight.items.map((c) => c.name)).not.toContain('Corner');
      const corner = wide.items.find((c) => c.name === 'Corner');
      expect(corner?.distanceKm).toBeCloseTo(13.2, 0);
    });

    it('measures in kilometers, not meters', async () => {
      const { items: clubs } = await service.findNearby(search({ radiusKm: 500 }));

      const lviv = clubs.find((c) => c.name === 'Lviv');
      expect(Math.abs((lviv?.distanceKm ?? 0) - 468)).toBeLessThan(1);
      expect(clubs[clubs.length - 1].name).toBe('Lviv'); // the farthest comes last
    });

    // radius 14 km holds four clubs: Center, East, North, Corner (nearest first)
    it('returns the requested page of the distance-sorted list, with meta', async () => {
      const first = await service.findNearby(search({ radiusKm: 14, page: 1, limit: 2 }));
      const second = await service.findNearby(search({ radiusKm: 14, page: 2, limit: 2 }));

      expect(first.items.map((c) => c.name)).toEqual(['Center', 'East']);
      expect(second.items.map((c) => c.name)).toEqual(['North', 'Corner']);
      expect(second.meta).toEqual({ page: 2, limit: 2, total: 4, totalPages: 2 });
    });

    it('counts in meta.total the clubs inside the circle, not inside the box', async () => {
      const { meta } = await service.findNearby(search({ radiusKm: 10, limit: 2 }));

      expect(meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    });

    it('returns an empty page, not an error, when the page is past the end', async () => {
      const result = await service.findNearby(search({ radiusKm: 14, page: 3, limit: 2 }));

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(4);
    });

    it('asks the database for a box, and pages only after sorting (no take/skip in the query)', async () => {
      await service.findNearby(search({ radiusKm: 1 }));

      expect(repo.find).toHaveBeenCalledTimes(1);
      const query = repo.find.mock.calls[0][0];
      expect(Object.keys(query?.where ?? {}).sort()).toEqual(['lat', 'lng']);
      expect(query).not.toHaveProperty('take');
      expect(query).not.toHaveProperty('skip');
    });

    it('returns an empty page when no club is close enough', async () => {
      const result = await service.findNearby(search({ lat: 0, lng: 0 }));

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });
});
