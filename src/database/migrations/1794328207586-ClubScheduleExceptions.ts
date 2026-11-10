import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubScheduleExceptions1794328207586 implements MigrationInterface {
  name = 'ClubScheduleExceptions1794328207586';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "club_schedule_exceptions" ("clubId" uuid NOT NULL, "date" date NOT NULL, "closed" boolean NOT NULL, "opensAt" TIME, "closesAt" TIME, "note" character varying(200), CONSTRAINT "CHK_71d41de090a6c8561db69d4ef8" CHECK (("closed" AND "opensAt" IS NULL AND "closesAt" IS NULL) OR (NOT "closed" AND "opensAt" IS NOT NULL AND "closesAt" IS NOT NULL)), CONSTRAINT "PK_03e5c59c3332464c9417d380ba4" PRIMARY KEY ("clubId", "date"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_schedule_exceptions" ADD CONSTRAINT "FK_20dadd5eaf55b777c73f1f4f238" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "club_schedule_exceptions" DROP CONSTRAINT "FK_20dadd5eaf55b777c73f1f4f238"`,
    );
    await queryRunner.query(`DROP TABLE "club_schedule_exceptions"`);
  }
}
