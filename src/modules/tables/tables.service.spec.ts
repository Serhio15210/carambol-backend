import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuditService } from '@/modules/audit/audit.service';
import { AuditAction } from '@/modules/audit/types/audit-action.enum';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { Actor } from '@/modules/users/users.service';
import { BilliardTable } from './entities/billiard-table.entity';
import { CreateBilliardTableDto } from './dto/create-billiard-table.dto';
import { GetBilliardTablesQueryDto } from './dto/get-billiard-tables-query.dto';
import { BilliardTableStatus } from './types/table-status.enum';
import { BilliardTableType } from './types/table-type.enum';
import { BilliardTablesService } from './billiard-tables.service';
import { MIN_GAP_CM } from './table-layout';

type FindAndCountArgs = {
  where?: Record<string, unknown>;
  order?: { number?: string };
  skip?: number;
  take?: number;
};

// In-memory stand-in for Repository<BilliardTable>. It supports exactly the methods from the
// lesson contract and behaves like TypeORM for them: soft-deleted rows are hidden unless
// withDeleted is set, and every read returns a copy (like a fresh row from the database).
class FakeTablesRepository {
  rows: BilliardTable[] = [];
  private nextId = 1;

  create = (data: Partial<BilliardTable>) => ({ ...data }) as BilliardTable;

  merge = (target: BilliardTable, data: Partial<BilliardTable>) => Object.assign(target, data);

  save = (table: BilliardTable) => {
    const row = {
      ...table,
      id: table.id ?? `t${this.nextId++}`,
      status: table.status ?? BilliardTableStatus.ACTIVE, // the column default
      rotation: table.rotation ?? 0, // the column default
      deletedAt: table.deletedAt ?? null,
    };
    this.rows = [...this.rows.filter((r) => r.id !== row.id), { ...row }];
    // Like TypeORM: save() fills generated values (id, defaults) into the SAME object and returns it.
    return Promise.resolve(Object.assign(table, row));
  };

  findOneBy = ({ id }: { id: string }) =>
    Promise.resolve(this.copy(this.active().find((r) => r.id === id)));

  findOne = ({ where, withDeleted }: { where: { id: string }; withDeleted?: boolean }) =>
    Promise.resolve(
      this.copy((withDeleted ? this.rows : this.active()).find((r) => r.id === where.id)),
    );

  find = () => Promise.resolve(this.active().map((r) => ({ ...r })));

  findAndCount = ({ where = {}, order, skip = 0, take }: FindAndCountArgs) => {
    let items = this.active().filter((row) =>
      Object.entries(where).every(
        ([key, value]) =>
          value === undefined || (row as unknown as Record<string, unknown>)[key] === value,
      ),
    );
    if (order?.number) {
      const sign = String(order.number).toUpperCase() === 'DESC' ? -1 : 1;
      items = [...items].sort((a, b) => sign * (a.number - b.number));
    }
    const end = take === undefined ? undefined : skip + take;
    return Promise.resolve([items.slice(skip, end).map((r) => ({ ...r })), items.length]);
  };

  softDelete = (id: string) => {
    this.setDeletedAt(id, new Date());
    return Promise.resolve({ affected: 1 });
  };

  restore = (id: string) => {
    this.setDeletedAt(id, null);
    return Promise.resolve({ affected: 1 });
  };

  // Puts a row straight into the "database", bypassing the service (no overlap check).
  seed(data: Partial<BilliardTable>) {
    const row = {
      id: `seed${this.nextId++}`,
      type: BilliardTableType.POOL,
      status: BilliardTableStatus.ACTIVE,
      lengthCm: 300,
      widthCm: 150,
      x: 0,
      y: 0,
      rotation: 0,
      deletedAt: null,
      ...data,
    } as BilliardTable;
    this.rows.push(row);
    return row;
  }

  private active() {
    return this.rows.filter((r) => r.deletedAt === null);
  }

  private copy(row: BilliardTable | undefined) {
    return row ? { ...row } : null;
  }

  private setDeletedAt(id: string, value: Date | null) {
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, deletedAt: value } : r));
  }
}

// A 300 × 150 cm table; with rotation 0 its length lies along the x axis.
const newTable = (
  number: number,
  x: number,
  y = 500,
  extra: Partial<CreateBilliardTableDto> = {},
) =>
  ({
    number,
    type: BilliardTableType.POOL,
    lengthCm: 300,
    widthCm: 150,
    x,
    y,
    rotation: 0,
    ...extra,
  }) as CreateBilliardTableDto;

const actor: Actor = { id: 'admin', role: UserRole.ADMIN };

const query = (extra: Partial<GetBilliardTablesQueryDto> = {}): GetBilliardTablesQueryDto => ({
  page: 1,
  limit: 20,
  ...extra,
});

describe('BilliardTablesService', () => {
  let repo: FakeTablesRepository;
  const record = jest.fn();
  let service: BilliardTablesService;

  beforeEach(() => {
    record.mockReset().mockResolvedValue(undefined);
    repo = new FakeTablesRepository();
    service = new BilliardTablesService(
      repo as unknown as Repository<BilliardTable>,
      { record } as unknown as AuditService,
    );
  });

  describe('stage 1: create and list', () => {
    it('creates a table, gives it an id and the active status by default', async () => {
      const table = await service.create(actor, newTable(1, 500));

      expect(table.id).toBeDefined();
      expect(table.status).toBe(BilliardTableStatus.ACTIVE);
    });

    it('writes an audit entry with the id of the SAVED table', async () => {
      const table = await service.create(actor, newTable(1, 500));

      expect(table.id).toBeDefined();
      expect(record.mock.calls[0].slice(0, 3)).toEqual([
        'admin',
        AuditAction.TableCreate,
        table.id,
      ]);
    });

    it('lists created tables with pagination meta', async () => {
      await service.create(actor, newTable(1, 500));

      const page = await service.findAll(query());

      expect(page.items.map((t) => t.number)).toEqual([1]);
      expect(page.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });
  });

  describe('stage 2: get, update, delete, restore', () => {
    it('finds a table by id', async () => {
      const created = await service.create(actor, newTable(1, 500));

      await expect(service.findById(created.id)).resolves.toMatchObject({ number: 1 });
    });

    it('returns 404 for an unknown id', async () => {
      await expect(service.findById('ghost')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.update(actor, 'ghost', { number: 2 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.softDelete(actor, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.restore(actor, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates only the fields that were sent', async () => {
      const created = await service.create(actor, newTable(1, 500));

      const updated = await service.update(actor, created.id, {
        status: BilliardTableStatus.MAINTENANCE,
      });

      expect(updated.status).toBe(BilliardTableStatus.MAINTENANCE);
      expect(updated.number).toBe(1);
      expect(updated.x).toBe(500);
    });

    it('soft-deletes a table: it disappears from the list and from findById', async () => {
      const created = await service.create(actor, newTable(1, 500));

      await service.softDelete(actor, created.id);

      expect((await service.findAll(query())).items).toHaveLength(0);
      await expect(service.findById(created.id)).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.rows).toHaveLength(1); // the row is still in the database
    });

    it('restores a deleted table', async () => {
      const created = await service.create(actor, newTable(1, 500));
      await service.softDelete(actor, created.id);

      const restored = await service.restore(actor, created.id);

      expect(restored.id).toBe(created.id);
      expect(restored.deletedAt).toBeNull();
      expect((await service.findAll(query())).items).toHaveLength(1);
    });

    it('returns 409 when restoring a table that is not deleted', async () => {
      const created = await service.create(actor, newTable(1, 500));

      await expect(service.restore(actor, created.id)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('stage 3: filters and pagination', () => {
    it('filters by type and status', async () => {
      repo.seed({ number: 1, type: BilliardTableType.POOL, status: BilliardTableStatus.ACTIVE });
      repo.seed({ number: 2, type: BilliardTableType.PYRAMID, status: BilliardTableStatus.ACTIVE });
      repo.seed({
        number: 3,
        type: BilliardTableType.POOL,
        status: BilliardTableStatus.MAINTENANCE,
      });

      const pool = await service.findAll(query({ type: BilliardTableType.POOL }));
      const activePool = await service.findAll(
        query({ type: BilliardTableType.POOL, status: BilliardTableStatus.ACTIVE }),
      );

      expect(pool.items.map((t) => t.number)).toEqual([1, 3]);
      expect(activePool.items.map((t) => t.number)).toEqual([1]);
    });

    it('sorts by number and returns the requested page', async () => {
      [3, 1, 2, 5, 4].forEach((number) => repo.seed({ number }));

      const page = await service.findAll(query({ page: 2, limit: 2 }));

      expect(page.items.map((t) => t.number)).toEqual([3, 4]);
      expect(page.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    });

    it('returns an empty page past the end, not an error', async () => {
      repo.seed({ number: 1 });

      const page = await service.findAll(query({ page: 5, limit: 20 }));

      expect(page.items).toEqual([]);
      expect(page.meta.total).toBe(1);
    });
  });

  // Table A below sits at x 350..650, y 425..575 (center 500,500; 300 × 150; rotation 0).
  // G = MIN_GAP_CM: the passage the service must keep between table edges.
  describe('stage 4: tables keep a passage between them on the hall plan', () => {
    const G = MIN_GAP_CM;

    it('rejects a table that overlaps another one and saves nothing', async () => {
      await service.create(actor, newTable(1, 500));

      await expect(service.create(actor, newTable(2, 700))).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repo.rows).toHaveLength(1);
    });

    it('allows a table exactly MIN_GAP_CM away', async () => {
      await service.create(actor, newTable(1, 500));

      // B: x (650 + G)..(950 + G), its left edge is G cm from A's right edge
      await expect(service.create(actor, newTable(2, 800 + G))).resolves.toBeDefined();
    });

    it('rejects a table closer than MIN_GAP_CM', async () => {
      await service.create(actor, newTable(1, 500));

      await expect(service.create(actor, newTable(2, 800 + G - 1))).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('uses the rotated footprint: rotation 90 swaps length and width', async () => {
      await service.create(actor, newTable(1, 500));

      // rotation 0 → left edge 590 + G (too close); rotation 90 → left edge 665 + G (far enough)
      await expect(service.create(actor, newTable(2, 740 + G))).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(
        service.create(actor, newTable(2, 740 + G, 500, { rotation: 90 })),
      ).resolves.toBeDefined();
    });

    it('lets a table move a little without conflicting with itself', async () => {
      const a = await service.create(actor, newTable(1, 500));

      await expect(service.update(actor, a.id, { x: 510 })).resolves.toMatchObject({ x: 510 });
    });

    it('rejects moving a table onto another one and keeps the old position', async () => {
      const a = await service.create(actor, newTable(1, 500));
      const b = await service.create(actor, newTable(2, 2000));

      await expect(service.update(actor, b.id, { x: 600 })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect((await service.findById(b.id)).x).toBe(2000);
      expect((await service.findById(a.id)).x).toBe(500);
    });

    it('frees the spot of a deleted table', async () => {
      const a = await service.create(actor, newTable(1, 500));
      await service.softDelete(actor, a.id);

      await expect(service.create(actor, newTable(2, 500))).resolves.toBeDefined();
    });

    it('refuses to restore a table whose spot is now taken', async () => {
      const a = await service.create(actor, newTable(1, 500));
      await service.softDelete(actor, a.id);
      await service.create(actor, newTable(2, 500));

      await expect(service.restore(actor, a.id)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.findById(a.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
