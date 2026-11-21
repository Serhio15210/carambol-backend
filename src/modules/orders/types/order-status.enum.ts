// Stored as a PostgreSQL enum. Only `cancelled` frees the table: pending, reserved and finished
// orders keep their time slot taken (see the exclusion constraint in order.entity.ts), so a table is
// held while the customer pays.
// pending = waiting for the payment, reserved = paid (or free), finished = over, cancelled = freed.
// PENDING is LAST on purpose: PostgreSQL appends a new enum value to the end (ADD VALUE), and
// TypeORM compares the order of the values, so this order must match the database.
export enum OrderStatus {
  RESERVED = 'reserved',
  CANCELLED = 'cancelled',
  FINISHED = 'finished',
  PENDING = 'pending',
}
