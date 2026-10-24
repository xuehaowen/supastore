import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { migrateLocale } from "../../scripts/migrate-database-locale.mjs";

// Opt-in: admin connection to a local PostgreSQL 18 container. Only generated
// databases are written/dropped; the configured application database is untouched.
const server = process.env.LOCALE_MIGRATION_TEST_URL;
describe.skipIf(!server)("locale backup and restore", () => {
  const source = `locale_source_${randomUUID().replaceAll("-", "")}`;
  const target = `locale_target_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>, client: ReturnType<typeof postgres>;
  let connection: string, backupDir: string;
  beforeAll(async () => {
    const url = new URL(server!);
    if (!["localhost", "127.0.0.1"].includes(url.hostname))
      throw new Error("Local synthetic fixture required");
    url.pathname = "/postgres";
    admin = postgres(url.toString(), { onnotice: () => {} });
    await admin.unsafe(
      `create database "${source}" template template0 encoding 'UTF8' locale_provider builtin builtin_locale 'C'`,
    );
    url.pathname = `/${source}`;
    connection = url.toString();
    client = postgres(connection, { onnotice: () => {} });
    await migrate(drizzle(client), {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
    await client`insert into products(handle,title,description) values('cafe','Café 中文 🛍️','Crème brûlée')`;
    await client`create table locale_sequence_fixture(id bigserial primary key, value text)`;
    await client`insert into locale_sequence_fixture(value) values('日本語')`;
    await client`create table locale_large_fixture(value text)`;
    await client`insert into locale_large_fixture select md5(random()::text) from generate_series(1,20000)`;
    await admin`revoke connect on database ${admin(source)} from public`;
    await admin`alter database ${admin(source)} set statement_timeout to '15s'`;
    await admin`alter database ${admin(source)} set search_path to public, pg_catalog`;
    backupDir = await mkdtemp(resolve(".tmp-cuj/locale-backup-"));
  }, 30000);
  afterAll(async () => {
    if (client) await client.end();
    if (admin) {
      for (const name of [source, target])
        await admin.unsafe(`drop database if exists "${name}" with (force)`);
      await admin.end();
    }
    if (backupDir && resolve(backupDir).startsWith(resolve(".tmp-cuj") + sep))
      await rm(backupDir, { recursive: true, force: true });
  });
  it("plans without mutation, then restores and validates a Unicode database", async () => {
    const options = {
      connection,
      target,
      backupDir,
      container: process.env.LOCALE_MIGRATION_TEST_CONTAINER || "postgres",
    };
    expect((await migrateLocale(options)).mode).toBe("plan");
    expect(
      await admin`select 1 from pg_database where datname=${target}`,
    ).toHaveLength(0);
    const report = await migrateLocale({
      ...options,
      apply: true,
      writesPaused: true,
    });
    expect(report.mode).toBe("validated");
    if (!("targetSettings" in report))
      throw new Error("Expected validated migration report");
    expect(report.targetSettings.locale).toBe("PG_UNICODE_FAST");
    expect(
      report.tables.some(
        (table: { table?: string }) => table.table === "products",
      ),
    ).toBe(true);
    expect(
      await client`select title from products where handle='cafe'`,
    ).toEqual([{ title: "Café 中文 🛍️" }]);
    await expect(migrateLocale(options)).rejects.toThrow("already exists");
  }, 60000);
});
