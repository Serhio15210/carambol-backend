import { compare } from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { ensureSuperadmin, SuperadminSettings } from './superadmin.seed';

// In-memory stand-in for Repository<User>: findOneBy matches every key of `where`.
class FakeUsersRepository {
  rows: User[] = [];

  findOneBy = (where: Partial<User>) =>
    Promise.resolve(
      this.rows.find((row) =>
        Object.entries(where).every(([key, value]) => row[key as keyof User] === value),
      ) ?? null,
    );

  create = (data: Partial<User>) => ({ ...data }) as User;

  save = (user: User) => {
    const saved = { ...user, id: `u${this.rows.length + 1}` };
    this.rows.push(saved);
    return Promise.resolve(saved);
  };
}

const settings: SuperadminSettings = {
  userName: 'owner',
  email: 'Owner@Example.com',
  phone: '+380501112233',
  password: 'secret-pass-123',
};

describe('ensureSuperadmin', () => {
  let repo: FakeUsersRepository;
  const run = () => ensureSuperadmin(repo as unknown as Repository<User>, settings);

  beforeEach(() => {
    repo = new FakeUsersRepository();
  });

  it('creates a superadmin on an empty database', async () => {
    await expect(run()).resolves.toBe('created');

    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      userName: 'owner',
      phone: '+380501112233',
      role: UserRole.SUPERADMIN,
    });
  });

  it('stores the email in lower case, like registration does (login looks it up in lower case)', async () => {
    await run();

    expect(repo.rows[0].email).toBe('owner@example.com');
  });

  it('stores a bcrypt hash, never the plain password', async () => {
    await run();

    const { passwordHash } = repo.rows[0];
    expect(passwordHash).not.toBe(settings.password);
    await expect(compare(settings.password, passwordHash)).resolves.toBe(true);
  });

  it('fills the required name columns', async () => {
    await run();

    expect(repo.rows[0].firstName).toEqual(expect.any(String));
    expect(repo.rows[0].firstName.length).toBeGreaterThan(0);
    expect(repo.rows[0].lastName.length).toBeGreaterThan(0);
  });

  it('is idempotent: a second run finds the superadmin and creates nothing', async () => {
    await run();

    await expect(run()).resolves.toBe('exists');
    expect(repo.rows).toHaveLength(1);
  });
});
