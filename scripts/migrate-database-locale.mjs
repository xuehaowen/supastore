import postgres from "postgres";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { databaseUrl, createDatabase } from "./init-db.mjs";
import { inspectDatabase } from "./database-settings.mjs";

// Passwords are passed through the child environment, never process arguments.
export function toolConnection(connection, container) {
  const url = new URL(connection);
  if (url.searchParams.has("password"))
    throw new Error("Use URL userinfo for the password.");
  const password = decodeURIComponent(url.password);
  url.password = "";
  if (container) {
    url.hostname = "127.0.0.1";
    url.port = "5432";
  }
  return { url: url.toString(), password };
}

export async function runTool(
  tool,
  args,
  { connection, container, binDir, input, output } = {},
) {
  const credentials = connection
    ? toolConnection(connection, container)
    : undefined;
  const command = container
    ? "docker"
    : binDir
      ? join(binDir, tool + (process.platform === "win32" ? ".exe" : ""))
      : tool;
  const commandArgs = [
    ...(container ? ["exec", "-i", "-e", "PGPASSWORD", container, tool] : []),
    ...args,
    ...(credentials ? ["--dbname", credentials.url, "--no-password"] : []),
  ];
  const child = spawn(command, commandArgs, {
    windowsHide: true,
    env: {
      ...process.env,
      ...(credentials?.password ? { PGPASSWORD: credentials.password } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Discard tool diagnostics: connection strings and restored customer data can
  // occur in stderr. The backup and retained target support manual investigation.
  child.stderr.resume();
  const finished = new Promise((accept, reject) => {
    child.once("error", () =>
      reject(
        new Error(
          `${tool} could not start; install PostgreSQL 18 client tools or select --container.`,
        ),
      ),
    );
    child.once("close", (code) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              `${tool} failed (exit ${code}); source and backup are preserved.`,
            ),
          ),
    );
  });
  const transfers = [];
  let text = "";
  if (output)
    transfers.push(
      pipeline(
        child.stdout,
        createWriteStream(output, { flags: "wx", mode: 0o600 }),
      ),
    );
  else
    child.stdout.on("data", (data) => {
      text += data.toString();
    });
  if (input)
    transfers.push(
      pipeline(createReadStream(input), child.stdin).catch(async (error) => {
        // --list may finish after the TOC, before consuming a large archive.
        if (
          args.includes("--list") &&
          ["EPIPE", "ERR_STREAM_PREMATURE_CLOSE"].includes(error.code)
        )
          return await finished;
        throw error;
      }),
    );
  else child.stdin.end();
  try {
    await Promise.all([finished, ...transfers]);
  } catch (error) {
    child.kill();
    await Promise.allSettled([finished, ...transfers]);
    throw error;
  }
  return text.trim();
}

export async function fingerprint(sql) {
  await sql`set timezone = 'UTC'`;
  const tables = await sql`select schemaname, tablename from pg_tables
    where schemaname not in ('pg_catalog','information_schema')
      and schemaname not like 'pg_toast%' order by schemaname collate "C", tablename collate "C"`;
  const result = [];
  for (const table of tables) {
    // Commutative checksums avoid sorting/aggregating whole tables in memory.
    // Exclude generated columns, which are recomputed under the target locale.
    const columns = await sql`select a.attname from pg_attribute a
      join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=${table.schemaname} and c.relname=${table.tablename}
        and a.attnum>0 and not a.attisdropped and a.attgenerated=''
      order by a.attnum`;
    const names = columns.map((column) => column.attname);
    const rows = names.length
      ? sql`jsonb_build_array(${sql(names)})`
      : sql`'[]'::jsonb`;
    const [count] = await sql`select count(*)::text as count,
      coalesce(sum(('x'||substr(md5(${rows}::text),1,16))::bit(64)::bigint),0)::text as checksum
      from ${sql(table.schemaname)}.${sql(table.tablename)}`;
    result.push({ schema: table.schemaname, table: table.tablename, ...count });
  }
  const sequences = await sql`select schemaname, sequencename from pg_sequences
    where schemaname not like 'pg_%' order by schemaname collate "C", sequencename collate "C"`;
  for (const sequence of sequences) {
    const [state] =
      await sql`select last_value::text, is_called from ${sql(sequence.schemaname)}.${sql(sequence.sequencename)}`;
    result.push({
      schema: sequence.schemaname,
      sequence: sequence.sequencename,
      ...state,
    });
  }
  return result;
}

export async function databaseMetadata(sql) {
  const [database] =
    await sql`select pg_get_userbyid(datdba) as owner from pg_database where datname=current_database()`;
  const grants =
    await sql`select * from (select case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee,
    a.privilege_type as privilege, a.is_grantable as grantable
    from pg_database d, lateral aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
    where datname=current_database()) x order by grantee collate "C", privilege collate "C", grantable`;
  const settings =
    await sql`select * from (select case when s.setrole=0 then '' else pg_get_userbyid(s.setrole) end as role,
    unnest(s.setconfig) as setting from pg_db_role_setting s join pg_database d on d.oid=s.setdatabase
    where d.datname=current_database()) x order by role collate "C", setting collate "C"`;
  return { owner: database.owner, grants, settings };
}

async function restoreDatabaseMetadata(admin, target, metadata) {
  await admin`alter database ${admin(target)} owner to ${admin(metadata.owner)}`;
  await admin`revoke all on database ${admin(target)} from public`;
  await admin`revoke all on database ${admin(target)} from ${admin(metadata.owner)}`;
  for (const grant of metadata.grants) {
    if (!["CONNECT", "CREATE", "TEMPORARY"].includes(grant.privilege))
      throw new Error("Unsupported database privilege");
    const role =
      grant.grantee === "PUBLIC"
        ? admin.unsafe("PUBLIC")
        : admin(grant.grantee);
    await admin`grant ${admin.unsafe(grant.privilege)} on database ${admin(target)} to ${role} ${grant.grantable ? admin.unsafe("WITH GRANT OPTION") : admin.unsafe("")}`;
  }
  for (const { role, setting } of metadata.settings) {
    const separator = setting.indexOf("=");
    const name = setting.slice(0, separator),
      value = setting.slice(separator + 1);
    // FROM CURRENT preserves list-valued GUCs such as search_path exactly.
    const [command] = role
      ? await admin`select pg_catalog.format('ALTER ROLE %I IN DATABASE %I SET %I FROM CURRENT',${role}::text,${target}::text,${name}::text) as sql`
      : await admin`select pg_catalog.format('ALTER DATABASE %I SET %I FROM CURRENT',${target}::text,${name}::text) as sql`;
    await admin.begin(async (tx) => {
      await tx`select pg_catalog.set_config(${name},${value},true)`;
      await tx.unsafe(command.sql);
    });
  }
}

/** @param {{ connection: string, target: string, apply?: boolean, writesPaused?: boolean, backupDir?: string, container?: string, binDir?: string }} options */
export async function migrateLocale({
  connection,
  target,
  apply = false,
  writesPaused = false,
  backupDir = ".database-backups",
  container,
  binDir,
}) {
  const targetUrl = databaseUrl(connection, target);
  if (new URL(connection).pathname === new URL(targetUrl).pathname)
    throw new Error("Target must differ from the source database.");
  if (apply && !writesPaused)
    throw new Error(
      "Stop application writers and workers, then pass --writes-paused with --apply.",
    );
  const source = postgres(connection, {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const adminUrl = new URL(connection);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), {
    max: 1,
    connect_timeout: 10,
    onnotice: () => {},
  });
  let restored;
  try {
    const settings = await inspectDatabase(source);
    if (!settings.compatible) throw new Error(settings.errors.join(" "));
    if ((await admin`select 1 from pg_database where datname=${target}`).length)
      throw new Error("Target database already exists; choose a new name.");
    const metadata = await databaseMetadata(source);
    const plan = {
      source: decodeURIComponent(new URL(connection).pathname.slice(1)),
      target,
      settings,
      action:
        "backup, restore into new UTF8/PG_UNICODE_FAST database, validate; connection URLs remain unchanged",
    };
    if (!apply) return { mode: "plan", ...plan };
    for (const tool of ["pg_dump", "pg_restore"]) {
      const version = await runTool(tool, ["--version"], { container, binDir });
      if (!/\(PostgreSQL\) 18\./.test(version))
        throw new Error("Use PostgreSQL 18 client tools for this migration.");
    }
    if (container) {
      const [identity] =
        await source`select system_identifier::text as id from pg_control_system()`;
      const remote = await runTool(
        "psql",
        ["-Atc", "select system_identifier::text from pg_control_system()"],
        { connection, container, binDir },
      );
      if (remote !== identity.id)
        throw new Error(
          "Selected container is not the source PostgreSQL cluster.",
        );
    }
    await mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backup = resolve(backupDir, `${target}-${randomUUID()}.dump`);
    let expected;
    await source.begin(
      "isolation level repeatable read read only",
      async (tx) => {
        const [snapshot] = await tx`select pg_export_snapshot() as id`;
        await runTool(
          "pg_dump",
          ["--format=custom", "--snapshot", snapshot.id],
          { connection, container, binDir, output: backup },
        );
        expected = await fingerprint(tx);
      },
    );
    await runTool("pg_restore", ["--list"], {
      container,
      binDir,
      input: backup,
    });
    if (!(await createDatabase(admin, target)))
      throw new Error(
        "Target was created by another process; restore stopped.",
      );
    await runTool("pg_restore", ["--exit-on-error", "--single-transaction"], {
      connection: targetUrl,
      container,
      binDir,
      input: backup,
    });
    await restoreDatabaseMetadata(admin, target, metadata);
    restored = postgres(targetUrl, { max: 1, onnotice: () => {} });
    const actual = await fingerprint(restored);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(
        "Restored row counts, checksums or sequence states differ; do not switch URLs.",
      );
    if (JSON.stringify(await fingerprint(source)) !== JSON.stringify(expected))
      throw new Error(
        "Source changed during migration; keep writes paused and restart with a new target.",
      );
    if (
      JSON.stringify(await databaseMetadata(restored)) !==
        JSON.stringify(metadata) ||
      JSON.stringify(await databaseMetadata(source)) !==
        JSON.stringify(metadata)
    )
      throw new Error(
        "Database permissions or settings differ; do not switch URLs.",
      );
    const targetSettings = await inspectDatabase(restored);
    if (!targetSettings.compatible || !targetSettings.recommended)
      throw new Error("Target database settings failed validation.");
    const invalid =
      await restored`select 1 from pg_index where not indisvalid limit 1`;
    if (invalid.length)
      throw new Error("Restored database contains invalid indexes.");
    await restored`analyze`;
    const report = {
      mode: "validated",
      ...plan,
      backup,
      targetSettings,
      tables: actual,
      cutover:
        "Validate application flows, then switch URLs manually while writes remain paused. Keep source for rollback.",
    };
    await writeFile(`${backup}.json`, JSON.stringify(report, null, 2), {
      flag: "wx",
      mode: 0o600,
    });
    return report;
  } finally {
    if (restored) await restored.end();
    await source.end();
    await admin.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "node scripts/migrate-database-locale.mjs --target NAME [--apply --writes-paused] [--backup-dir PATH] [--pg-bin PATH | --container NAME]\nDefault: read-only plan. Requires PostgreSQL 18 clients. Source and connection URLs are preserved.",
    );
  } else {
    try {
      try {
        process.loadEnvFile();
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const value = (name) => args[args.indexOf(name) + 1];
      const allowed = new Set([
        "--target",
        "--backup-dir",
        "--pg-bin",
        "--container",
        "--apply",
        "--writes-paused",
      ]);
      for (let i = 0; i < args.length; i++) {
        if (!allowed.has(args[i])) throw new Error("Unknown argument.");
        if (
          !["--apply", "--writes-paused"].includes(args[i]) &&
          (!args[++i] || args[i].startsWith("--"))
        )
          throw new Error("Missing argument value.");
      }
      const connection =
        process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
      if (!connection || !args.includes("--target"))
        throw new Error("Set DATABASE_URL and supply --target NAME.");
      console.log(
        JSON.stringify(
          await migrateLocale({
            connection,
            target: value("--target"),
            apply: args.includes("--apply"),
            writesPaused: args.includes("--writes-paused"),
            backupDir: args.includes("--backup-dir")
              ? value("--backup-dir")
              : undefined,
            binDir: args.includes("--pg-bin") ? value("--pg-bin") : undefined,
            container: args.includes("--container")
              ? value("--container")
              : undefined,
          }),
          null,
          2,
        ),
      );
    } catch (error) {
      console.error(
        error.code
          ? `Locale migration failed (${error.code}); source and any backup are preserved.`
          : error.message,
      );
      process.exitCode = 1;
    }
  }
}
