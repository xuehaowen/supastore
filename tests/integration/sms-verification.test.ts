import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
const active = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/infrastructure/db", () => ({
  get db() {
    return active.db;
  },
}));
import * as schema from "@/infrastructure/db/schema";
import { smsDisclosure } from "@supastore/contracts";
import {
  updateCustomerSms,
  applyPhoneOptOut,
} from "@/application/use-cases/customers/sms-preferences";
import type {
  PhoneVerifier,
  VerificationStartResult,
  VerificationCheckResult,
} from "@/application/ports/notifications";
const server = process.env.TRANSLATION_TEST_DATABASE_URL;
describe.skipIf(!server)("provider-neutral phone consent claims", () => {
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  const name = `sms_verify_${randomUUID().replaceAll("-", "")}`;
  beforeAll(async () => {
    admin = postgres(server!);
    await admin.unsafe(
      `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
    );
    const url = new URL(server!);
    url.pathname = `/${name}`;
    client = postgres(url.toString(), { onnotice: () => {} });
    active.db = drizzle(client, { schema });
    await migrate(active.db as ReturnType<typeof drizzle>, {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`insert into store_settings(store_name,support_email,public_content,sms_policy) values('SMS tests','help@example.test','{"en":{"privacy":"Privacy","terms":"Terms"}}','{"enabled":true,"reviewed":true}')`;
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH(FORCE)`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await client`delete from sms_consent_events`;
    await client`delete from sms_preferences`;
  });
  async function user() {
    const id = randomUUID();
    await client`insert into "user"(id,name,email,email_verified) values(${id},'Customer',${id + "@example.test"},true)`;
    return id;
  }
  const fake = (): PhoneVerifier => ({
    identity: { provider: "fake", profile: "profile-a" },
    start: vi
      .fn()
      .mockResolvedValue({ status: "pending", verificationId: "fake-id" }),
    check: vi.fn().mockResolvedValue("approved"),
  });
  it("records public consent and verification snapshots and preserves them after STOP", async () => {
    const verifier = fake();
    const disclosure = smsDisclosure({ storeName: "SMS tests" });
    const claim = await updateCustomerSms(
      null,
      {
        operation: "start",
        phone: "+12025550888",
        consent: true,
        disclosure,
        source: "checkout",
      },
      verifier,
      true,
    );
    expect(claim?.verified).toBe(false);
    expect(
      (
        await client`select opted_in from sms_preferences where id=${claim!.preferenceId}`
      )[0]!.opted_in,
    ).toBe(false);
    await updateCustomerSms(
      null,
      {
        operation: "confirm",
        preferenceId: claim!.preferenceId,
        code: "123456",
      },
      verifier,
      true,
    );
    await (active.db as ReturnType<typeof drizzle<typeof schema>>).transaction(
      (tx) => applyPhoneOptOut(tx, "+12025550888"),
    );
    const events =
      await client`select action,wording,source from sms_consent_events where preference_id=${claim!.preferenceId} order by created_at`;
    expect(events.map((e) => e.action)).toEqual([
      "requested",
      "verified",
      "withdrawn",
    ]);
    expect(events[0]).toMatchObject({
      wording: disclosure,
      source: "checkout",
    });
    expect(
      (
        await client`select opted_in,consent_at from sms_preferences where id=${claim!.preferenceId}`
      )[0],
    ).toMatchObject({ opted_in: false, consent_at: null });
  });
  it("rejects missing consent, stale disclosures and unready merchants before provider IO", async () => {
    const verifier = fake();
    await expect(
      updateCustomerSms(
        null,
        { operation: "start", phone: "+12025550889", consent: false },
        verifier,
        true,
      ),
    ).rejects.toThrow("Consent");
    await expect(
      updateCustomerSms(
        null,
        {
          operation: "start",
          phone: "+12025550889",
          consent: true,
          disclosure: "old text",
        },
        verifier,
        true,
      ),
    ).rejects.toThrow("terms changed");
    await client`update store_settings set sms_policy='{"enabled":false,"reviewed":true}'`;
    await expect(
      updateCustomerSms(
        null,
        { operation: "start", phone: "+12025550889", consent: true },
        verifier,
        true,
      ),
    ).rejects.toThrow("incomplete or disabled");
    await client`update store_settings set sms_policy='{"enabled":true,"reviewed":true}'`;
    expect(verifier.start).not.toHaveBeenCalled();
  });
  it("never calls providers by default and never permits unverified customer identity", async () => {
    const verifier = fake(),
      id = await user();
    await expect(
      updateCustomerSms(
        id,
        { operation: "start", phone: "+12025550123", consent: true },
        verifier,
      ),
    ).rejects.toThrow("not enabled");
    expect(verifier.start).not.toHaveBeenCalled();
    await expect(
      updateCustomerSms(
        "missing",
        { operation: "start", phone: "+12025550123", consent: true },
        verifier,
        true,
      ),
    ).rejects.toThrow("verified");
    expect(verifier.start).not.toHaveBeenCalled();
  });
  it("pins provider/profile and rejects approval after opt-out during verification IO", async () => {
    const verifier = fake(),
      id = await user();
    await updateCustomerSms(
      id,
      { operation: "start", phone: "+12025550123", consent: true },
      verifier,
      true,
    );
    let finish!: (result: VerificationCheckResult) => void;
    verifier.check = vi.fn(
      () =>
        new Promise<VerificationCheckResult>((resolve) => {
          finish = resolve;
        }),
    );
    const confirmation = updateCustomerSms(
      id,
      { operation: "confirm", code: "123456" },
      verifier,
      true,
    );
    await vi.waitFor(() => expect(verifier.check).toHaveBeenCalled());
    await updateCustomerSms(id, { operation: "disable" });
    finish("approved");
    await expect(confirmation).rejects.toThrow("withdrawn");
    expect(
      (
        await client`select opted_in,request_nonce,verified_at from sms_preferences s join customers c on c.id=s.customer_id where c.auth_user_id=${id}`
      )[0],
    ).toMatchObject({
      opted_in: false,
      request_nonce: null,
      verified_at: null,
    });
  });
  it("cannot persist a late provider start after consent is withdrawn", async () => {
    const verifier = fake(),
      id = await user();
    let finish!: (result: VerificationStartResult) => void;
    verifier.start = vi.fn(
      () =>
        new Promise<VerificationStartResult>((resolve) => {
          finish = resolve;
        }),
    );
    const starting = updateCustomerSms(
      id,
      { operation: "start", phone: "+12025550123", consent: true },
      verifier,
      true,
    );
    await vi.waitFor(() => expect(verifier.start).toHaveBeenCalled());
    await updateCustomerSms(id, { operation: "disable" });
    finish({ status: "pending", verificationId: "late-id" });
    await expect(starting).rejects.toThrow("withdrawn");
    expect(
      (
        await client`select verification_sid from sms_preferences s join customers c on c.id=s.customer_id where c.auth_user_id=${id}`
      )[0]!.verification_sid,
    ).toBeNull();
  });
  it("a new phone invalidates an in-flight approval even when sending is rate limited", async () => {
    const verifier = fake(),
      id = await user();
    await updateCustomerSms(
      id,
      { operation: "start", phone: "+12025550123", consent: true },
      verifier,
      true,
    );
    let finish!: (result: VerificationCheckResult) => void;
    verifier.check = vi.fn(
      () =>
        new Promise<VerificationCheckResult>((resolve) => {
          finish = resolve;
        }),
    );
    const checking = updateCustomerSms(
      id,
      { operation: "confirm", code: "123456" },
      verifier,
      true,
    );
    await vi.waitFor(() => expect(verifier.check).toHaveBeenCalled());
    await expect(
      updateCustomerSms(
        id,
        { operation: "start", phone: "+12025550999", consent: true },
        verifier,
        true,
      ),
    ).rejects.toThrow("one minute");
    finish("approved");
    await expect(checking).rejects.toThrow("withdrawn");
    expect(
      (
        await client`select s.phone,s.opted_in from sms_preferences s join customers c on c.id=s.customer_id where c.auth_user_id=${id}`
      )[0],
    ).toMatchObject({ phone: "+12025550999", opted_in: false });
  });
  it("does not submit old verification IDs to a newly configured provider profile", async () => {
    const verifier = fake(),
      id = await user();
    await updateCustomerSms(
      id,
      { operation: "start", phone: "+12025550123", consent: true },
      verifier,
      true,
    );
    const changed = {
      ...fake(),
      identity: { provider: "fake", profile: "profile-b" },
    };
    await expect(
      updateCustomerSms(
        id,
        { operation: "confirm", code: "123456" },
        changed,
        true,
      ),
    ).rejects.toThrow("provider changed");
    expect(changed.check).not.toHaveBeenCalled();
  });
  it("bounds confirmation attempts on the persisted claim", async () => {
    const verifier = fake(),
      id = await user();
    await updateCustomerSms(
      id,
      { operation: "start", phone: "+12025550123", consent: true },
      verifier,
      true,
    );
    verifier.check = vi.fn().mockResolvedValue("invalid");
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(
        updateCustomerSms(
          id,
          { operation: "confirm", code: "123456" },
          verifier,
          true,
        ),
      ).rejects.toThrow("invalid");
    await expect(
      updateCustomerSms(
        id,
        { operation: "confirm", code: "123456" },
        verifier,
        true,
      ),
    ).rejects.toThrow("new verification");
    expect(verifier.check).toHaveBeenCalledTimes(5);
  });
  it("restores reserved attempts on provider outage and permits recovery", async () => {
    const verifier = fake(),
      id = await user();
    await updateCustomerSms(
      id,
      { operation: "start", phone: "+12025550123", consent: true },
      verifier,
      true,
    );
    verifier.check = vi.fn().mockResolvedValue("unavailable");
    for (let index = 0; index < 6; index++)
      await expect(
        updateCustomerSms(
          id,
          { operation: "confirm", code: "123456" },
          verifier,
          true,
        ),
      ).rejects.toThrow("temporarily unavailable");
    const [preference] =
      await client`select attempts,opted_in from sms_preferences s join customers c on c.id=s.customer_id where c.auth_user_id=${id}`;
    expect(preference).toMatchObject({ attempts: 0, opted_in: false });
    verifier.check = vi.fn().mockResolvedValue("approved");
    await updateCustomerSms(
      id,
      { operation: "confirm", code: "123456" },
      verifier,
      true,
    );
    expect(
      (
        await client`select opted_in from sms_preferences s join customers c on c.id=s.customer_id where c.auth_user_id=${id}`
      )[0]!.opted_in,
    ).toBe(true);
  });
  it("distinguishes expired verification from an incorrect code", async () => {
    const verifier = fake(),
      id = await user();
    await updateCustomerSms(
      id,
      { operation: "start", phone: "+12025550123", consent: true },
      verifier,
      true,
    );
    verifier.check = vi.fn().mockResolvedValue("expired");
    await expect(
      updateCustomerSms(
        id,
        { operation: "confirm", code: "123456" },
        verifier,
        true,
      ),
    ).rejects.toThrow("expired");
    await expect(
      updateCustomerSms(
        id,
        { operation: "confirm", code: "123456" },
        verifier,
        true,
      ),
    ).rejects.toThrow("new verification");
    expect(verifier.check).toHaveBeenCalledOnce();
  });
  it("limits verification starts by customer even when the number changes", async () => {
    const verifier = fake(),
      id = await user();
    for (let index = 0; index < 5; index++) {
      await updateCustomerSms(
        id,
        { operation: "start", phone: `+1202555012${index}`, consent: true },
        verifier,
        true,
      );
      await client`update sms_preferences set requested_at=now()-interval '2 minutes' where customer_id=(select id from customers where auth_user_id=${id})`;
    }
    await expect(
      updateCustomerSms(
        id,
        { operation: "start", phone: "+12025550999", consent: true },
        verifier,
        true,
      ),
    ).rejects.toThrow("Too many");
    expect(verifier.start).toHaveBeenCalledTimes(5);
  });
});
