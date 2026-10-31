import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsersUniqueAmongActive1793444864287 implements MigrationInterface {
  name = 'UsersUniqueAmongActive1793444864287';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_226bb9aa7aa8a69991209d58f59"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_a000cca60bcf04454e727699490"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7d78dc7f5bcc2f72a6201bcd48" ON "users" ("phone") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_262d8d714a42e664d987714a75" ON "users" ("email") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bb0b50ad2e693b5530af27a91c" ON "users" ("userName") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_bb0b50ad2e693b5530af27a91c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_262d8d714a42e664d987714a75"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7d78dc7f5bcc2f72a6201bcd48"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_a000cca60bcf04454e727699490" UNIQUE ("phone")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_226bb9aa7aa8a69991209d58f59" UNIQUE ("userName")`,
    );
  }
}
