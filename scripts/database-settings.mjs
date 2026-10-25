import postgres from "postgres";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function inspectDatabase(sql) {
  const [settings] = await sql`
    select current_setting('server_version_num')::int as version,
      pg_encoding_to_char(encoding) as encoding, datlocprovider as provider,
      coalesce(to_jsonb(d)->>'datlocale', datcollate) as locale,
      datcollate as collate, datctype as ctype
    from pg_database d where datname=current_database()`;
  const errors = [];
  if (settings.version < 180000)
    errors.push("PostgreSQL 18 or newer is required.");
  if (settings.encoding !== "UTF8")
    errors.push("UTF8 database encoding is required.");
  const recommended =
    settings.provider === "b" && settings.locale === "PG_UNICODE_FAST";
  return {
    ...settings,
    compatible: errors.length === 0,
    recommended,
    errors,
    warnings: recommended
      ? []
      : [
          "Existing locale differs from PG_UNICODE_FAST; migration is optional and requires a new database.",
        ],
  };
}

export async function reportDatabase(sql) {
  const report = await inspectDatabase(sql);
  console.log("Database configuration:", JSON.stringify(report));
  if (!report.compatible) throw new Error(report.errors.join(" "));
  return report;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const connection =
    process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connection) throw new Error("DATABASE_URL is required");
  const sql = postgres(connection, { max: 1, connect_timeout: 10 });
  try {
    await reportDatabase(sql);
  } catch (error) {
    console.error(
      "Database configuration check failed:",
      error.code || "incompatible configuration",
    );
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}
