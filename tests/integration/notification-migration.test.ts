import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)(
  "notification delivery forward-upgrade semantics",
  () => {
    it("retains old email acknowledgments as unconfirmed acceptance and preserves SMS delivery facts", async () => {
      const name = `notification_upgrade_${randomUUID().replaceAll("-", "")}`;
      const admin = postgres(server!);
      let client: ReturnType<typeof postgres> | undefined;
      try {
        await admin.unsafe(
          `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
        );
        const url = new URL(server!);
        url.pathname = `/${name}`;
        client = postgres(url.toString(), { onnotice: () => {} });
        await client.unsafe(`CREATE TABLE event_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),channel text NOT NULL,status text NOT NULL,lease_token text,lease_expires_at timestamptz,provider_message_id text,provider_status text);
        CREATE FUNCTION protect_commerce_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable attempt history'; END; $$;`);
        const [email] =
          await client`insert into event_deliveries(channel,status) values('email','delivered') returning id`;
        const [sms] =
          await client`insert into event_deliveries(channel,status,provider_message_id,provider_status) values('sms','delivered','proven-sms','delivered') returning id`;
        const [unknown] =
          await client`insert into event_deliveries(channel,status,lease_token,lease_expires_at) values('email','pending','old-worker',now()-interval '1 minute') returning id`;
        const migration = readFileSync(
          "apps/backend/src/infrastructure/db/migrations/0033_notification_delivery.sql",
          "utf8",
        );
        for (const statement of migration.split("--> statement-breakpoint"))
          if (statement.trim()) await client.unsafe(statement);
        expect(
          (
            await client`select status,provider_status from event_deliveries where id=${email!.id}`
          )[0],
        ).toMatchObject({
          status: "accepted",
          provider_status: "legacy_success_unverified",
        });
        expect(
          (
            await client`select status,provider_message_id from event_deliveries where id=${sms!.id}`
          )[0],
        ).toMatchObject({
          status: "delivered",
          provider_message_id: "proven-sms",
        });
        expect(
          (
            await client`select status,lease_token from event_deliveries where id=${unknown!.id}`
          )[0],
        ).toMatchObject({ status: "review", lease_token: null });
      } finally {
        if (client) await client.end();
        await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    }, 30000);
  },
);
