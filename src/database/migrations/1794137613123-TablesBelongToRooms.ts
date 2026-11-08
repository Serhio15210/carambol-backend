import { MigrationInterface, QueryRunner } from 'typeorm';

// Tables get a mandatory room. The column is NOT NULL, but tables already exist, so it is added
// in three steps (expand / contract): add it empty, fill it, then make it mandatory.
export class TablesBelongToRooms1794137613123 implements MigrationInterface {
  name = 'TablesBelongToRooms1794137613123';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Expand: the column may be empty for now.
    await queryRunner.query(`ALTER TABLE "billiard_tables" ADD "roomId" uuid`);

    // 2. Fill: existing tables move into a placeholder club and room, if there are any tables.
    //    shortcut: the placeholder room is huge (the maximum the API allows) so that every old
    //    table is inside it; rename the club and fix the room size by hand afterwards.
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::int AS "count" FROM "billiard_tables"`,
    )) as [{ count: number }];
    if (count > 0) {
      const [club] = (await queryRunner.query(
        `INSERT INTO "clubs" ("name", "address", "lat", "lng")
         VALUES ('Imported tables (rename me)', 'unknown', 0, 0) RETURNING "id"`,
      )) as [{ id: string }];
      const [room] = (await queryRunner.query(
        `INSERT INTO "rooms" ("clubId", "name", "widthCm", "lengthCm")
         VALUES ($1, 'Main hall', 20000, 20000) RETURNING "id"`,
        [club.id],
      )) as [{ id: string }];
      await queryRunner.query(`UPDATE "billiard_tables" SET "roomId" = $1`, [room.id]);
    }

    // 3. Contract: now the column is full, so it can become mandatory.
    await queryRunner.query(`ALTER TABLE "billiard_tables" ALTER COLUMN "roomId" SET NOT NULL`);

    // A table number is unique per room now, not in the whole database.
    await queryRunner.query(`DROP INDEX "public"."IDX_6c465e940b43cc9c2412ce526f"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_67c3a454de51eb4d7afaf769d7" ON "billiard_tables" ("roomId", "number") WHERE "deletedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "billiard_tables" ADD CONSTRAINT "FK_0f90800b686b525e3929b72f6a4" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  // The placeholder club and room from step 2 stay in the database. Going back also fails if two
  // rooms already use the same table number: the old index wants numbers unique everywhere.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billiard_tables" DROP CONSTRAINT "FK_0f90800b686b525e3929b72f6a4"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_67c3a454de51eb4d7afaf769d7"`);
    await queryRunner.query(`ALTER TABLE "billiard_tables" DROP COLUMN "roomId"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6c465e940b43cc9c2412ce526f" ON "billiard_tables" ("number") WHERE ("deletedAt" IS NULL)`,
    );
  }
}
