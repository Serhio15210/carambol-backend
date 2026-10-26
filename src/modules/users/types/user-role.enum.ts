export enum UserRole {
  SUPERADMIN = 'superadmin',
  ADMIN = 'admin',
  USER = 'user',
}

// Role hierarchy: a higher rank manages strictly lower ranks (an admin manages users,
// a superadmin manages admins and users). Equal ranks never manage each other.
export const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.USER]: 1,
  [UserRole.ADMIN]: 2,
  [UserRole.SUPERADMIN]: 3,
};
