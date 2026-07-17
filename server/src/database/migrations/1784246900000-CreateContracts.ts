import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Shartnomalar jadvali — platforma egasi va klub egalari o'rtasidagi
 * to'lov kelishuvlari (oylik/yillik obunalar). Platforma daromadi
 * hisobotlari shu jadvaldan olinadi.
 */
export class CreateContracts1784246900000 implements MigrationInterface {
  name = 'CreateContracts1784246900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."contract_type" AS ENUM('monthly', 'quarterly', 'semiannual', 'yearly', 'custom')`,
    );
    await queryRunner.query(`
      CREATE TABLE "contracts" (
        "id" SERIAL NOT NULL,
        "clubId" integer NOT NULL,
        "type" "public"."contract_type" NOT NULL DEFAULT 'monthly',
        "amount" numeric(14,2) NOT NULL,
        "startDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "endDate" TIMESTAMP WITH TIME ZONE NOT NULL,
        "notes" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_contracts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_contracts_club" FOREIGN KEY ("clubId") REFERENCES "clubs"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_contracts_amount_nonneg" CHECK ("amount" >= 0),
        CONSTRAINT "chk_contracts_dates" CHECK ("endDate" > "startDate")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_contracts_clubId" ON "contracts" ("clubId")`);
    await queryRunner.query(`CREATE INDEX "IDX_contracts_createdAt" ON "contracts" ("createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "contracts"`);
    await queryRunner.query(`DROP TYPE "public"."contract_type"`);
  }
}
