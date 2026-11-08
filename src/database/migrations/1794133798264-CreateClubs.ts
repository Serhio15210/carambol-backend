import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClubs1794133798264 implements MigrationInterface {
  name = 'CreateClubs1794133798264';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "clubs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "address" character varying NOT NULL, "lat" double precision NOT NULL, "lng" double precision NOT NULL, "minGapCm" integer NOT NULL DEFAULT '150', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bb09bd0c8d5238aeaa8f86ee0d4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_360d3c3eb017994de7740a9490" ON "clubs" ("lat", "lng") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_360d3c3eb017994de7740a9490"`);
    await queryRunner.query(`DROP TABLE "clubs"`);
  }
}
