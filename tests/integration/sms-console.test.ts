import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
const active = vi.hoisted(() => ({ db: undefined as unknown, quiet: false }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
vi.mock("@/application/notifications/sms-policy", async (original) => ({
  ...(await original<
    typeof import("@/application/notifications/sms-policy")
  >()),
  smsQuietUntil: () => (active.quiet ? new Date(Date.now() + 3600000) : null),
}));
import * as schema from "@/infrastructure/db/schema";
import { smsDisclosure, SMS_CONSENT_VERSION } from "@supastore/contracts";
import { processSmsBatch } from "@/infrastructure/worker/sms";
import { closeNotificationProviders } from "@/infrastructure/bootstrap/notification-providers";
import { logger } from "@/infrastructure/security/logger";
const server = process.env.TRANSLATION_TEST_DATABASE_URL;

describe.skipIf(!server)("explicit SMS console previews", () => {
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  const database = `sms_console_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${database}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
    );
    const url = new URL(server!);
    url.pathname = `/${database}`;
    client = postgres(url.toString(), { onnotice: () => {} });
    active.db = drizzle(client, { schema });
    await migrate(active.db as ReturnType<typeof drizzle>, {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`insert into store_settings(store_name,support_email,public_content,sms_policy) values('Console fixture','support@example.test','{"en":{"privacy":"Privacy","terms":"Terms"}}','{"enabled":true,"reviewed":true}')`;
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH(FORCE)`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    active.quiet = false;
    for (const [key, value] of Object.entries({
      EMAIL_PROVIDER: "disabled",
      SMS_PROVIDER: "console",
      PHONE_VERIFICATION_PROVIDER: "disabled",
      SMS_LIVE_AUTHORIZED: "false",
      DISABLE_OUTBOUND_DELIVERY: "false",
      STOREFRONT_ORIGIN: "http://localhost:3000",
      APP_URL: "http://localhost:3000",
      BETTER_AUTH_URL: "http://localhost:3000",
    }))
      vi.stubEnv(key, value);
    await client`truncate outbox_events,event_deliveries cascade`;
  });
  afterEach(async () => {
    await closeNotificationProviders();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
  async function order(optedIn = true) {
    const [preference] =
      await client`insert into sms_preferences(phone,opted_in,verified_at,consent_at,consent_text,consent_version) values('+12025550123',${optedIn},now(),now()-interval '1 hour',${smsDisclosure({ storeName: "Console fixture" })},${SMS_CONSENT_VERSION}) returning id`;
    const [cart] =
      await client`insert into carts(guest_session_id) values(${randomUUID()}) returning id`;
    const [quote] =
      await client`insert into quotes(cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at) values(${cart!.id},1,1000,0,0,0,1000,'[]','{}',now()+interval '1 hour') returning id`;
    const [order] =
      await client`insert into orders(source_cart_id,quote_id,reference_code,purchase_total_cents,guest_email,guest_name,shipping_address_snapshot,sms_preference_id) values(${cart!.id},${quote!.id},${randomUUID()},1000,'buyer@example.test','Fixture','{}',${preference!.id}) returning id,reference_code`;
    const [event] =
      await client`insert into outbox_events(event_type,aggregate_type,aggregate_id,payload) values('order.confirmed','order',${order!.id},${JSON.stringify({ referenceCode: order!.reference_code })}::jsonb) returning id`;
    return event!.id;
  }
  it("prints once, preserves the template, and records a console preview without external delivery", async () => {
    const event = await order();
    const log = vi.spyOn(logger, "info").mockImplementation(() => {});
    await processSmsBatch();
    const [delivery] =
      await client`select status,provider_name,provider_status,template_version_id,attempts from event_deliveries where event_id=${event} and channel='sms'`;
    expect(delivery).toMatchObject({
      status: "suppressed",
      provider_name: "console-sms",
      provider_status: "console_preview",
      attempts: 1,
    });
    expect(delivery!.template_version_id).toBeTruthy();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).toContain("***0123");
    expect(JSON.stringify(log.mock.calls)).not.toContain("+12025550123");
    await processSmsBatch();
    expect(log).toHaveBeenCalledTimes(1);
  });
  it("preserves consent and quiet-hour checks for console previews", async () => {
    await order(false);
    const event = await order();
    const log = vi.spyOn(logger, "info").mockImplementation(() => {});
    active.quiet = true;
    await processSmsBatch();
    expect(log).not.toHaveBeenCalled();
    expect(
      (
        await client`select attempts from event_deliveries where event_id=${event}`
      )[0]!.attempts,
    ).toBe(0);
    active.quiet = false;
    await client`update event_deliveries set retry_after=now()`;
    await processSmsBatch();
    expect(log).toHaveBeenCalledTimes(1);
  });
  it("does not enqueue or print during global outbound suppression", async () => {
    await order();
    const log = vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.stubEnv("DISABLE_OUTBOUND_DELIVERY", "true");
    expect(await processSmsBatch()).toBe(0);
    expect(log).not.toHaveBeenCalled();
    expect(await client`select id from event_deliveries`).toHaveLength(0);
  });

  it("leaves disabled SMS silent without creating preview deliveries", async () => {
    await order();
    vi.stubEnv("SMS_PROVIDER", "disabled");
    const log = vi.spyOn(logger, "info").mockImplementation(() => {});
    expect(await processSmsBatch()).toBe(0);
    expect(log).not.toHaveBeenCalled();
    expect(await client`select id from event_deliveries`).toHaveLength(0);
  });

  it("does not redirect an existing live-provider delivery to the console", async () => {
    const event = await order();
    await client`insert into event_deliveries(event_id,recipient,channel,provider_name,provider_profile) values(${event},'+12025550123','sms','telnyx','live-profile')`;
    const log = vi.spyOn(logger, "info").mockImplementation(() => {});
    await processSmsBatch();
    expect(log).not.toHaveBeenCalled();
    expect(
      (
        await client`select status,provider_status,attempts from event_deliveries where event_id=${event}`
      )[0],
    ).toMatchObject({
      status: "review",
      provider_status: "pinned_provider_unavailable",
      attempts: 0,
    });
  });
});
