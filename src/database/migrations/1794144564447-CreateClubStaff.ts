import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateClubStaff1794144564447 implements MigrationInterface {
  name = 'CreateClubStaff1794144564447';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."club_staff_role_enum" AS ENUM('owner', 'manager')`,
    );
    await queryRunner.query(
      `CREATE TABLE "club_staff" ("clubId" uuid NOT NULL, "userId" uuid NOT NULL, "role" "public"."club_staff_role_enum" NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4fe656429573b7d05b6c60ed7f3" PRIMARY KEY ("clubId", "userId"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_staff" ADD CONSTRAINT "FK_449bad8ddd395cac51d6b8c3ba8" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_staff" ADD CONSTRAINT "FK_599dabdfa8e5d4e70dc7fee5fc5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "club_staff" DROP CONSTRAINT "FK_599dabdfa8e5d4e70dc7fee5fc5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "club_staff" DROP CONSTRAINT "FK_449bad8ddd395cac51d6b8c3ba8"`,
    );
    await queryRunner.query(`DROP TABLE "club_staff"`);
    await queryRunner.query(`DROP TYPE "public"."club_staff_role_enum"`);
  }
}
