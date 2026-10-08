import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const compose = [
  "compose",
  "-p",
  "supastore-codex-smoke",
  "-f",
  "scripts/compose.smoke.yml",
];
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`Docker fixture command failed: ${result.stderr}`);
  return result.stdout;
}
function sql(text, database = "supastore_smoke") {
  return docker(
    [
      ...compose,
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    text,
  );
}
const fingerprint =
  "select count(*),md5(coalesce(string_agg(row_to_json(t)::text,'|' order by id),'')) from orders t; select count(*),md5(coalesce(string_agg(row_to_json(t)::text,'|' order by id),'')) from order_items t; select count(*),md5(coalesce(string_agg(row_to_json(t)::text,'|' order by id),'')) from guest_order_sessions t;";
const expected = sql(fingerprint).trim();
const dump = docker([
  ...compose,
  "exec",
  "-T",
  "postgres",
  "pg_dump",
  "-U",
  "postgres",
  "--no-owner",
  "--no-acl",
  "supastore_smoke",
]);
sql("CREATE DATABASE supastore_restore_fixture;", "postgres");
try {
  sql(dump, "supastore_restore_fixture");
  docker([
    ...compose,
    "run",
    "--rm",
    "-e",
    "DATABASE_URL=postgresql://postgres:fixture-only@postgres:5432/supastore_restore_fixture",
    "migrate",
  ]);
  assert.equal(sql(fingerprint, "supastore_restore_fixture").trim(), expected);
  const origin = "http://localhost:3097";
  docker([...compose, "stop", "backend"]);
  const offline = await fetch(origin + "/api/health/ready", {
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(!offline.ok, "Backend outage must fail public readiness");
  docker([...compose, "start", "backend"]);
  let recovered = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if (
        (
          await fetch(origin + "/api/health/ready", {
            signal: AbortSignal.timeout(2000),
          })
        ).ok
      ) {
        recovered = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(recovered, "Backend must recover readiness within 30 seconds");
  console.log(
    JSON.stringify({
      passed: true,
      restored: ["orders", "order_items", "guest_order_sessions"],
      outageReadiness: offline.status,
      recovered: true,
    }),
  );
} finally {
  docker([...compose, "start", "backend"]);
  sql("DROP DATABASE supastore_restore_fixture WITH (FORCE);", "postgres");
}
