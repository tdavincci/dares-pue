import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Supabase publishes the `public` schema through its auto-generated Data API (anon/authenticated roles).
 * Enabling RLS with no policies blocks those roles from every table. The backend connects as the table owner,
 * which bypasses RLS, so the app is unaffected. On plain PostgreSQL this is equally harmless.
 */
const TABLES = [
  'users',
  'farmers',
  'devices',
  'location_pings',
  'payments',
  'api_clients',
  'api_access_tokens',
  'migrations',
];

export class EnableRowLevelSecurity1793903340214 implements MigrationInterface {
  name = 'EnableRowLevelSecurity1793903340214';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLES) {
      await queryRunner.query(`ALTER TABLE IF EXISTS "public"."${t}" ENABLE ROW LEVEL SECURITY`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of TABLES) {
      await queryRunner.query(`ALTER TABLE IF EXISTS "public"."${t}" DISABLE ROW LEVEL SECURITY`);
    }
  }
}
