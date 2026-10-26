// Stored as plain text (varchar), not as a PostgreSQL enum: adding a new action
// then needs no schema change.
export enum AuditAction {
  UserCreate = 'user.create',
  UserUpdate = 'user.update',
  UserRoleChange = 'user.role_change',
  UserBlock = 'user.block',
  UserUnblock = 'user.unblock',
  UserDelete = 'user.delete',
}
