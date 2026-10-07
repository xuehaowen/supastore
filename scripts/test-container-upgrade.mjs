import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const compose = ["compose", "-p", "supastore-codex-smoke", "-f", "scripts/compose.smoke.yml"];
function docker(args, input) {
  const result = spawnSync("docker", args, { input, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`Fixture upgrade failed: ${result.stderr}`);
  return result.stdout;
}
function sql(database, text) { return docker([...compose, "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], text); }
const baseline = "supastore_upgrade_baseline";
const restored = "supastore_upgrade_restored";
const url = database => `DATABASE_URL=postgresql://postgres:fixture-only@postgres:5432/${database}`;
const migration28 = "const fs=require('fs');const cp=require('child_process');const p='src/infrastructure/db/migrations/meta/_journal.json';const j=JSON.parse(fs.readFileSync(p));j.entries=j.entries.filter(e=>e.idx<=28);fs.writeFileSync(p,JSON.stringify(j));cp.execFileSync('node',['migrate.mjs'],{stdio:'inherit'});";
const fingerprint = "select id,title,handle from products order by id; select id,product_id,sku,price_cents from product_variants order by id; select id,account_name,account_identifier from payment_accounts order by id; select store_name,support_email from store_settings;";
try {
  sql("postgres", `CREATE DATABASE ${baseline}; CREATE DATABASE ${restored};`);
  docker([...compose, "run", "--rm", "-e", url(baseline), "migrate", "node", "-e", migration28]);
  sql(baseline, readFileSync("scripts/seed-container-smoke.sql", "utf8"));
  const expected = sql(baseline, fingerprint);
  const dump = docker([...compose, "exec", "-T", "postgres", "pg_dump", "-U", "postgres", "--no-owner", "--no-acl", baseline]);
  sql(restored, dump);
  docker([...compose, "run", "--rm", "-e", url(restored), "migrate"]);
  assert.equal(sql(restored, fingerprint), expected, "Upgrade must preserve synthetic catalog/store/payment identities and values");
  const applied = sql(restored, "select count(*) from drizzle.__drizzle_migrations;").trim();
  console.log(JSON.stringify({ passed: true, baselineMigration: 28, latestAppliedCount: Number(applied), restoredBeforeUpgrade: true, preserved: ["catalog", "variants", "store", "payment-accounts"] }));
} finally {
  sql("postgres", `DROP DATABASE IF EXISTS ${baseline} WITH (FORCE); DROP DATABASE IF EXISTS ${restored} WITH (FORCE);`);
}
