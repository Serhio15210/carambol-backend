import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRooms1794135350486 implements MigrationInterface {
  name = 'CreateRooms1794135350486';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "rooms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "name" character varying NOT NULL, "widthCm" integer NOT NULL, "lengthCm" integer NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_0368a2d7c215f2d0458a54933f2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c80f4823ce6752e184799c9ff8" ON "rooms" ("clubId", "name") `,
    );
    await queryRunner.query(
      `ALTER TABLE "rooms" ADD CONSTRAINT "FK_6ccb2bceb64f0465d1b643b1c86" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rooms" DROP CONSTRAINT "FK_6ccb2bceb64f0465d1b643b1c86"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c80f4823ce6752e184799c9ff8"`);
    await queryRunner.query(`DROP TABLE "rooms"`);
  }
}
