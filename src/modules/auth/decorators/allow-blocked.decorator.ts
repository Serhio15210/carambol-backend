import { SetMetadata } from '@nestjs/common';

export const ALLOW_BLOCKED_KEY = 'allowBlocked';

// Marks a route that a blocked user may still call (read own profile, log out).
// Everything else is denied by BlockedUserGuard: deny by default, allow by exception.
export const AllowBlocked = () => SetMetadata(ALLOW_BLOCKED_KEY, true);
