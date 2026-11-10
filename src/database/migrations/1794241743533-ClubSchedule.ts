import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClubSchedule1794241743533 implements MigrationInterface {
  name = 'ClubSchedule1794241743533';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "club_opening_hours" ("clubId" uuid NOT NULL, "weekday" smallint NOT NULL, "opensAt" TIME NOT NULL, "closesAt" TIME NOT NULL, CONSTRAINT "CHK_803ef66ef4d140e9d998852db0" CHECK ("weekday" BETWEEN 1 AND 7), CONSTRAINT "PK_246db67efdeb711b39221600763" PRIMARY KEY ("clubId", "weekday"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "clubs" ADD "timezone" character varying NOT NULL DEFAULT 'Europe/Kyiv'`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_opening_hours" ADD CONSTRAINT "FK_7fb1b96ca800a8f54e4f252bd6d" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "club_opening_hours" DROP CONSTRAINT "FK_7fb1b96ca800a8f54e4f252bd6d"`,
    );
    await queryRunner.query(`ALTER TABLE "clubs" DROP COLUMN "timezone"`);
    await queryRunner.query(`DROP TABLE "club_opening_hours"`);
  }
}
