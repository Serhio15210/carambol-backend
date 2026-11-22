import { MigrationInterface, QueryRunner } from 'typeorm';

export class Memberships1795340872608 implements MigrationInterface {
  name = 'Memberships1795340872608';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."memberships_status_enum" AS ENUM('pending', 'active', 'past_due', 'canceled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "memberships" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "status" "public"."memberships_status_enum" NOT NULL DEFAULT 'pending', "stripeCustomerId" character varying, "stripeSubscriptionId" character varying, "currentPeriodEnd" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_c7b511c8360ec82bddab19eb387" UNIQUE ("stripeSubscriptionId"), CONSTRAINT "PK_25d28bd932097a9e90495ede7b4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_913abf60cfe838ddd481058897" ON "memberships" ("userId") WHERE "status" <> 'canceled'`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD CONSTRAINT "FK_187d573e43b2c2aa3960df20b78" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP CONSTRAINT "FK_187d573e43b2c2aa3960df20b78"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_913abf60cfe838ddd481058897"`);
    await queryRunner.query(`DROP TABLE "memberships"`);
    await queryRunner.query(`DROP TYPE "public"."memberships_status_enum"`);
  }
}
