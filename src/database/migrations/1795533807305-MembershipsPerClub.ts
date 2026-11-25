import { MigrationInterface, QueryRunner } from 'typeorm';

export class MembershipsPerClub1795533807305 implements MigrationInterface {
  name = 'MembershipsPerClub1795533807305';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_913abf60cfe838ddd481058897"`);
    await queryRunner.query(`ALTER TABLE "memberships" ADD "planId" uuid`);
    await queryRunner.query(`ALTER TABLE "memberships" ADD "clubId" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_beaa843adedea03e63616ac655" ON "memberships" ("userId", "clubId") WHERE "status" <> 'canceled'`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD CONSTRAINT "FK_5088acebaddd7b00e3c1b775de1" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" ADD CONSTRAINT "FK_494314c13e0cb7e3daa38235380" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP CONSTRAINT "FK_494314c13e0cb7e3daa38235380"`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP CONSTRAINT "FK_5088acebaddd7b00e3c1b775de1"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_beaa843adedea03e63616ac655"`);
    await queryRunner.query(`ALTER TABLE "memberships" DROP COLUMN "clubId"`);
    await queryRunner.query(`ALTER TABLE "memberships" DROP COLUMN "planId"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_913abf60cfe838ddd481058897" ON "memberships" ("userId") WHERE (status <> 'canceled'::memberships_status_enum)`,
    );
  }
}
