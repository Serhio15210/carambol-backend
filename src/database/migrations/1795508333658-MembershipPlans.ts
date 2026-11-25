import { MigrationInterface, QueryRunner } from 'typeorm';

export class MembershipPlans1795508333658 implements MigrationInterface {
  name = 'MembershipPlans1795508333658';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "membership_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clubId" uuid NOT NULL, "name" character varying(100) NOT NULL, "priceCents" integer NOT NULL, "discountPercent" smallint NOT NULL, "stripePriceId" character varying, "archivedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_a76173f0ee706476bdb398d20d0" UNIQUE ("stripePriceId"), CONSTRAINT "CHK_membership_plans_discount_range" CHECK ("discountPercent" BETWEEN 1 AND 100), CONSTRAINT "CHK_membership_plans_price_min" CHECK ("priceCents" >= 50), CONSTRAINT "PK_85ca9d6f4262a6bbff2a540c640" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_b6a794487768cb167601f18609" ON "membership_plans" ("clubId", "name") WHERE "archivedAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "membership_plans" ADD CONSTRAINT "FK_399bb7d88761dadb17eb73dad82" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "membership_plans" DROP CONSTRAINT "FK_399bb7d88761dadb17eb73dad82"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_b6a794487768cb167601f18609"`);
    await queryRunner.query(`DROP TABLE "membership_plans"`);
  }
}
