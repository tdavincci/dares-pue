import { MigrationInterface, QueryRunner } from 'typeorm';

export class ApiAccessLog1794150000000 implements MigrationInterface {
  name = 'ApiAccessLog1794150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "api_access_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "client_id" uuid, "token_prefix" character varying(16), "method" character varying(8) NOT NULL, "endpoint" character varying(40) NOT NULL, "url" character varying(1000) NOT NULL, "status_code" integer NOT NULL, "success" boolean NOT NULL, "record_count" integer, "total" integer, "summary" character varying(300) NOT NULL, "error" text, "duration_ms" integer NOT NULL, "ip" character varying(64), "user_agent" character varying(300), CONSTRAINT "PK_api_access_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_api_access_logs_created_at" ON "api_access_logs" ("created_at") `);
    await queryRunner.query(
      `CREATE INDEX "IDX_api_access_logs_client_created" ON "api_access_logs" ("client_id", "created_at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "api_access_logs" ADD CONSTRAINT "FK_api_access_logs_client" FOREIGN KEY ("client_id") REFERENCES "api_clients"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // Same as the other tables: keep Supabase's Data API out (see EnableRowLevelSecurity).
    await queryRunner.query(`ALTER TABLE "api_access_logs" ENABLE ROW LEVEL SECURITY`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_access_logs"`);
  }
}
