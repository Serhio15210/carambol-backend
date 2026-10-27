import { UserRole } from '@/modules/users/types/user-role.enum';
import { forbiddenDescription } from './auth.decorator';

describe('forbiddenDescription', () => {
  it('mentions the blocked account on any protected route', () => {
    expect(forbiddenDescription([])).toContain('Account is blocked');
  });

  it('does not mention roles when the route needs no role', () => {
    expect(forbiddenDescription([]).toLowerCase()).not.toContain('role');
  });

  it('lists every required role', () => {
    const text = forbiddenDescription([UserRole.ADMIN, UserRole.SUPERADMIN]);

    expect(text).toContain('Account is blocked');
    expect(text).toContain('admin, superadmin');
  });
});
