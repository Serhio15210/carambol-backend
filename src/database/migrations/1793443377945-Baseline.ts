import { MigrationInterface, QueryRunner } from 'typeorm';

export class Baseline1793443377945 implements MigrationInterface {
  name = 'Baseline1793443377945';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() below comes from this extension. TypeORM also installs it on connect,
    // but the migration must not depend on that side effect. Not dropped in down: shared by the database.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('superadmin', 'admin', 'user')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userName" character varying NOT NULL, "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "email" character varying, "phone" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'user', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "blockedAt" TIMESTAMP WITH TIME ZONE, "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_226bb9aa7aa8a69991209d58f59" UNIQUE ("userName"), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "UQ_a000cca60bcf04454e727699490" UNIQUE ("phone"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."billiard_tables_type_enum" AS ENUM('pool', 'pyramid', 'snooker', 'carom')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."billiard_tables_status_enum" AS ENUM('active', 'maintenance')`,
    );
    await queryRunner.query(
      `CREATE TABLE "billiard_tables" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "number" integer NOT NULL, "type" "public"."billiard_tables_type_enum" NOT NULL, "status" "public"."billiard_tables_status_enum" NOT NULL DEFAULT 'active', "lengthCm" integer NOT NULL DEFAULT '0', "widthCm" integer NOT NULL DEFAULT '0', "x" integer NOT NULL DEFAULT '0', "y" integer NOT NULL DEFAULT '0', "rotation" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f46f8f88df6a86aa4dedaf5ca3f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6c465e940b43cc9c2412ce526f" ON "billiard_tables" ("number") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorId" uuid NOT NULL, "action" character varying NOT NULL, "targetId" uuid, "details" jsonb, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2dc33f7f3c22e2e7badafca1d1" ON "audit_logs" ("actorId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fcfb9137823075fb3162b82f73" ON "audit_logs" ("targetId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "refreshTokenHash" character varying NOT NULL, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "revokedAt" TIMESTAMP WITH TIME ZONE, "userAgent" character varying, "ip" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_167b8001a5a5b2aa5ffb94bb5ec" UNIQUE ("refreshTokenHash"), CONSTRAINT "PK_641507381f32580e8479efc36cd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_925b24d7fc2f9324ce972aee02" ON "auth_sessions" ("userId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_sessions" ADD CONSTRAINT "FK_925b24d7fc2f9324ce972aee025" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auth_sessions" DROP CONSTRAINT "FK_925b24d7fc2f9324ce972aee025"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_925b24d7fc2f9324ce972aee02"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fcfb9137823075fb3162b82f73"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2dc33f7f3c22e2e7badafca1d1"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6c465e940b43cc9c2412ce526f"`);
    await queryRunner.query(`DROP TABLE "billiard_tables"`);
    await queryRunner.query(`DROP TYPE "public"."billiard_tables_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."billiard_tables_type_enum"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
