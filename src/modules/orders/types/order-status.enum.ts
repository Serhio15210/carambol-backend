// Stored as a PostgreSQL enum. Only `cancelled` frees the table: reserved and finished orders keep
// their time slot taken (see the exclusion constraint in order.entity.ts).
// Payment states arrive with Stripe (lesson 19), automatic changes with cron jobs (lesson 18).
export enum OrderStatus {
  RESERVED = 'reserved',
  CANCELLED = 'cancelled',
  FINISHED = 'finished',
}
