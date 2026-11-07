import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793903340213 implements MigrationInterface {
  name = 'InitialSchema1793903340213';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "api_clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "description" text, "is_active" boolean NOT NULL DEFAULT true, "refresh_token_hash" character varying(64), "last_used_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ef2d5ef0eb5e9a6ddc67cfa310e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_e577ec8ceb7cb285a1bcfdd211" ON "api_clients"  ("refresh_token_hash") WHERE refresh_token_hash IS NOT NULL`,
    );
    await queryRunner.query(`CREATE TYPE "public"."token_kind" AS ENUM('STATIC', 'RENEWED')`);
    await queryRunner.query(
      `CREATE TABLE "api_access_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "client_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "token_prefix" character varying(16) NOT NULL, "kind" "public"."token_kind" NOT NULL, "label" character varying(120), "expires_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "last_used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_3ca83eeba644f4774a558ec50ef" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_281a3ff0bbce1ef86206fb3a3a" ON "api_access_tokens"  ("client_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8aa6b589a776da94ee7ceef797" ON "api_access_tokens"  ("token_hash") `,
    );
    await queryRunner.query(
      `CREATE TABLE "farmers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "seq" SERIAL NOT NULL, "account_number" character varying(40) NOT NULL, "full_name" character varying(160) NOT NULL, "phone" character varying(32) NOT NULL, "email" character varying(160), "state" character varying(80), "lga" character varying(80), "community" character varying(120), "address" text, "farm_name" character varying(160), "farm_latitude" double precision, "farm_longitude" double precision, "farm_size_hectares" numeric(10,2), "primary_crop" character varying(80), "category" character varying(60) NOT NULL DEFAULT 'IRRIGATION_FARMER', "notes" text, CONSTRAINT "PK_ccbe91e5e64dde1329b4c153637" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8f2509cfd25fabef2b06428519" ON "farmers"  ("account_number") `);
    await queryRunner.query(`CREATE INDEX "IDX_b1404d7f3feb2d58d99bfe68f0" ON "farmers"  ("phone") `);
    await queryRunner.query(
      `CREATE TYPE "public"."device_status" AS ENUM('REGISTERED', 'ACTIVE', 'SUSPENDED', 'DECOMMISSIONED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "devices" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "serial_number" character varying(80) NOT NULL, "tracker_imei" character varying(20) NOT NULL, "tracker_model" character varying(60) NOT NULL DEFAULT 'GT06', "tracker_sim_number" character varying(32), "pump_model" character varying(120), "pump_capacity" character varying(60), "price" numeric(14,2), "currency" character varying(3) NOT NULL DEFAULT 'NGN', "financing_id" character varying(80), "status" "public"."device_status" NOT NULL DEFAULT 'REGISTERED', "farmer_id" uuid, "geofence_radius_m" integer NOT NULL DEFAULT '500', "report_interval_minutes" integer NOT NULL DEFAULT '1', "installed_at" TIMESTAMP WITH TIME ZONE, "ingest_key_hash" character varying(64), "last_latitude" double precision, "last_longitude" double precision, "last_seen_at" TIMESTAMP WITH TIME ZONE, "last_fix_at" TIMESTAMP WITH TIME ZONE, "last_speed_kph" real, "last_battery_level" smallint, "last_distance_from_farm_m" double precision, "last_within_geofence" boolean, "notes" text, CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_cc9e89897e336172fd06367735" ON "devices"  ("serial_number") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_60df104f9dc52a52ee6ebb394b" ON "devices"  ("tracker_imei") `);
    await queryRunner.query(`CREATE INDEX "IDX_c37da3607f7214c3dda1803d09" ON "devices"  ("status") `);
    await queryRunner.query(`CREATE INDEX "IDX_46f9754edd2d236b37921d9210" ON "devices"  ("farmer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_ed2168de3a74c472a53cef4364" ON "devices"  ("last_seen_at") `);
    await queryRunner.query(`CREATE TYPE "public"."location_source" AS ENUM('GT06', 'HTTP', 'OSMAND')`);
    await queryRunner.query(
      `CREATE TABLE "location_pings" ("id" BIGSERIAL NOT NULL, "device_id" uuid NOT NULL, "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "received_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "speed_kph" real, "course" real, "altitude" real, "satellites" smallint, "gps_valid" boolean NOT NULL DEFAULT true, "battery_level" smallint, "source" "public"."location_source" NOT NULL, "distance_from_farm_m" double precision, "within_geofence" boolean, CONSTRAINT "PK_b666c5c0408c8bd318811640532" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "ix_location_recorded_at" ON "location_pings"  ("recorded_at") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_location_device_time" ON "location_pings"  ("device_id", "recorded_at") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'OPERATOR', 'VIEWER')`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(160) NOT NULL, "full_name" character varying(160) NOT NULL, "password_hash" character varying NOT NULL, "role" "public"."user_role" NOT NULL DEFAULT 'OPERATOR', "is_active" boolean NOT NULL DEFAULT true, "last_login_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `);
    await queryRunner.query(`CREATE TYPE "public"."payment_type" AS ENUM('FULL_PAYMENT', 'INSTALLMENT')`);
    await queryRunner.query(
      `CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'BANK_TRANSFER', 'POS', 'MOBILE_MONEY', 'CHEQUE', 'OTHER')`,
    );
    await queryRunner.query(`CREATE TYPE "public"."payment_status" AS ENUM('COMPLETED', 'REVERSED')`);
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "transaction_id" character varying(40) NOT NULL, "farmer_id" uuid NOT NULL, "device_id" uuid NOT NULL, "amount" numeric(14,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'NGN', "payment_type" "public"."payment_type" NOT NULL, "method" "public"."payment_method" NOT NULL, "reference" character varying(120), "paid_at" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."payment_status" NOT NULL DEFAULT 'COMPLETED', "reversal_reason" text, "reversed_at" TIMESTAMP WITH TIME ZONE, "recorded_by_id" uuid, "notes" text, CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3c324ca49dabde7ffc0ef64675" ON "payments"  ("transaction_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_d8e0b706887caea7a3d4712aa9" ON "payments"  ("farmer_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_9a6e6e244818561bc0eab48ea0" ON "payments"  ("device_id") `);
    await queryRunner.query(`CREATE INDEX "IDX_7848ab97e1ac9dddf781103de5" ON "payments"  ("paid_at") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_payment_one_full_per_device" ON "payments"  ("device_id") WHERE "status" = 'COMPLETED' AND "payment_type" = 'FULL_PAYMENT'`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_access_tokens" ADD CONSTRAINT "FK_281a3ff0bbce1ef86206fb3a3a1" FOREIGN KEY ("client_id") REFERENCES "api_clients"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "devices" ADD CONSTRAINT "FK_46f9754edd2d236b37921d92109" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "location_pings" ADD CONSTRAINT "FK_30b1e1aa6fc56bb8e21ddab2f93" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_d8e0b706887caea7a3d4712aa9d" FOREIGN KEY ("farmer_id") REFERENCES "farmers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_9a6e6e244818561bc0eab48ea06" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_48f20e5f3bafd282ca876aef968" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_48f20e5f3bafd282ca876aef968"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_9a6e6e244818561bc0eab48ea06"`);
    await queryRunner.query(`ALTER TABLE "payments" DROP CONSTRAINT "FK_d8e0b706887caea7a3d4712aa9d"`);
    await queryRunner.query(`ALTER TABLE "location_pings" DROP CONSTRAINT "FK_30b1e1aa6fc56bb8e21ddab2f93"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP CONSTRAINT "FK_46f9754edd2d236b37921d92109"`);
    await queryRunner.query(`ALTER TABLE "api_access_tokens" DROP CONSTRAINT "FK_281a3ff0bbce1ef86206fb3a3a1"`);
    await queryRunner.query(`DROP INDEX "public"."uq_payment_one_full_per_device"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7848ab97e1ac9dddf781103de5"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_9a6e6e244818561bc0eab48ea0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d8e0b706887caea7a3d4712aa9"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_3c324ca49dabde7ffc0ef64675"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payment_status"`);
    await queryRunner.query(`DROP TYPE "public"."payment_method"`);
    await queryRunner.query(`DROP TYPE "public"."payment_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_role"`);
    await queryRunner.query(`DROP INDEX "public"."uq_location_device_time"`);
    await queryRunner.query(`DROP INDEX "public"."ix_location_recorded_at"`);
    await queryRunner.query(`DROP TABLE "location_pings"`);
    await queryRunner.query(`DROP TYPE "public"."location_source"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ed2168de3a74c472a53cef4364"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_46f9754edd2d236b37921d9210"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c37da3607f7214c3dda1803d09"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_60df104f9dc52a52ee6ebb394b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cc9e89897e336172fd06367735"`);
    await queryRunner.query(`DROP TABLE "devices"`);
    await queryRunner.query(`DROP TYPE "public"."device_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b1404d7f3feb2d58d99bfe68f0"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8f2509cfd25fabef2b06428519"`);
    await queryRunner.query(`DROP TABLE "farmers"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8aa6b589a776da94ee7ceef797"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_281a3ff0bbce1ef86206fb3a3a"`);
    await queryRunner.query(`DROP TABLE "api_access_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."token_kind"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e577ec8ceb7cb285a1bcfdd211"`);
    await queryRunner.query(`DROP TABLE "api_clients"`);
  }
}
