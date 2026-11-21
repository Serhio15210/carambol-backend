import { MigrationInterface, QueryRunner } from 'typeorm';

export class Payments1794740554158 implements MigrationInterface {
  name = 'Payments1794740554158';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Written by hand. TypeORM would "swap" the whole orders_status_enum type, and that fails here:
    // the status column is used in the exclusion constraint no_double_booking. A plain ADD VALUE
    // appends 'pending' at the end (the same order as in OrderStatus). The new value must not be
    // USED in this transaction (PostgreSQL refuses), and nothing below uses it.
    await queryRunner.query(
      `ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'pending'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'succeeded', 'expired', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "amountCents" integer NOT NULL, "currency" character varying(3) NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "stripePaymentIntentId" character varying, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "paidAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_57059f281caef51ef1c15adaf35" UNIQUE ("stripePaymentIntentId"), CONSTRAINT "CHK_payments_amount_positive" CHECK ("amountCents" > 0), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "clubs" ADD "hourlyRateCents" integer NOT NULL DEFAULT '1000'`,
    );
    await queryRunner.query(`ALTER TABLE "orders" ADD "priceCents" integer NOT NULL DEFAULT '0'`);
    await queryRunner.query(`ALTER TABLE "orders" ADD "paymentId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_d35cb3c13a18e1ea1705b2817b1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_06a051324c76276ca2a9d1feb08" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // The value 'pending' stays in orders_status_enum: PostgreSQL cannot remove an enum value.
    // That is harmless (nothing uses it after this rollback), and up() is safe to run again.
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_06a051324c76276ca2a9d1feb08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_d35cb3c13a18e1ea1705b2817b1"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "paymentId"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "priceCents"`);
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN "hourlyRateCents"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
  }
}
