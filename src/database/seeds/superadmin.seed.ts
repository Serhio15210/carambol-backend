import { Repository } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import * as process from 'node:process';
import { UserRole } from '@/modules/users/types/user-role.enum';
import { hashPassword } from '@/common/security/password';

// The first superadmin: read from env in seed.ts, never hard-coded (the repository is public).
export type SuperadminSettings = {
  userName: string;
  email: string;
  phone: string;
  password: string;
};

// Creates the first superadmin once; a second run finds it by email and changes nothing.
// The seed bypasses the API, so it does what registration does: lower-case email, bcrypt hash.
export async function ensureSuperadmin(
  repo: Repository<User>,
  settings: SuperadminSettings,
): Promise<'created' | 'exists'> {
  const admin = await repo.findOneBy({ email: settings.email.toLowerCase() });
  if (admin) return 'exists';
  const passwordHash = await hashPassword(settings.password);
  const superAdmin = repo.create({
    ...settings,
    passwordHash,
    email: settings.email.toLowerCase(),
    firstName: process.env.SEED_SUPERADMIN_FIRSTNAME || 'Super',
    lastName: process.env.SEED_SUPERADMIN_LASTNAME || 'Admin',
    role: UserRole.SUPERADMIN,
  });
  await repo.save(superAdmin);
  return 'created';
}
