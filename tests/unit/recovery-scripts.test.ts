import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const bash =
  process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const posix = (path: string) =>
  path
    .replaceAll("\\", "/")
    .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "supastore-recovery-"));
  roots.push(root);
  const bin = join(root, "bin");
  mkdirSync(bin);
  const stub = `#!/usr/bin/env bash
name="$(basename "$0")"
if [ "$name" = "pg_dump" ]; then
  [ "\${FAIL_DUMP:-}" != "true" ] || exit 9
  while [ "$#" -gt 0 ]; do if [ "$1" = "-f" ]; then printf 'synthetic dump' > "$2"; exit; fi; shift; done
elif [ "$name" = "psql" ]; then
  case " $* " in *" -c "*) printf '%s\\n' "\${ACTIVE_CONNECTIONS:-0}"; exit;; esac
  [ "\${FAIL_RESTORE:-}" != "true" ] || exit 9
elif [ "$name" = "pg_restore" ]; then
  [ "\${FAIL_RESTORE:-}" != "true" ] || exit 9
elif [ "$name" = "node" ]; then
  [ "\${DISABLE_OUTBOUND_DELIVERY:-}" = "true" ] || exit 11
  [ "\${ENABLE_OUTBOX_WORKER:-}" = "false" ] || exit 12
  [ "\${MIGRATION_DATABASE_URL:-}" = "\${DATABASE_URL:-}" ] || exit 14
  printf 'migrations executed\\n'
  [ "\${FAIL_MIGRATION:-}" != "true" ] || exit 13
fi
`;
  for (const name of ["pg_dump", "pg_restore", "psql", "node"])
    writeFileSync(join(bin, name), stub, { mode: 0o755 });
  const dump = join(root, "database.dump");
  writeFileSync(dump, "fixture");
  return {
    root,
    bin,
    dump,
    run(script: string, args: string[], extra: Record<string, string> = {}) {
      return spawnSync(
        bash,
        [
          "-c",
          'export PATH="$TEST_BIN:/usr/bin:/bin"; exec bash "$TEST_SCRIPT" "$@"',
          "test",
          ...args.map(posix),
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            TEST_BIN: posix(bin),
            TEST_SCRIPT: posix(resolve(`scripts/${script}.sh`)),
            DATABASE_URL:
              "postgresql://fixture:private-password@localhost/fixture",
            RESTORE_COLD_CONFIRMED: "true",
            ...extra,
          },
        },
      );
    },
  };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
describe("disaster recovery command failures", () => {
  it("fails backup when PostgreSQL tools are unavailable", () => {
    const f = fixture();
    rmSync(join(f.bin, "pg_dump"));
    const target = join(f.root, "backup");
    const result = f.run("backup", [target]);
    expect(result.status).not.toBe(0);
    expect(existsSync(join(target, "backup-manifest.json"))).toBe(false);
  });
  it("publishes integrity metadata only after successful dumps", () => {
    const f = fixture();
    const target = join(f.root, "backup");
    expect(f.run("backup", [target]).status).toBe(0);
    expect(existsSync(join(target, "SHA256SUMS"))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(target, "backup-manifest.json"), "utf8"))
        .verified,
    ).toBe(true);
    expect(f.run("backup", [target]).status).not.toBe(0);
  });
  it("fails backup when dumping fails", () => {
    const f = fixture();
    const target = join(f.root, "backup");
    expect(f.run("backup", [target], { FAIL_DUMP: "true" }).status).not.toBe(0);
    expect(existsSync(join(target, "backup-manifest.json"))).toBe(false);
  });
  it("requires an explicit cold maintenance window", () => {
    const f = fixture();
    expect(
      f.run("restore", [f.dump], { RESTORE_COLD_CONFIRMED: "" }).status,
    ).not.toBe(0);
    expect(
      f.run("restore", [f.dump], { ACTIVE_CONNECTIONS: "1" }).status,
    ).not.toBe(0);
  });
  it("does not report success when restoring or migrating fails", () => {
    const f = fixture();
    expect(
      f.run("restore", [f.dump], { FAIL_RESTORE: "true" }).status,
    ).not.toBe(0);
    expect(
      f.run("restore", [f.dump], { FAIL_MIGRATION: "true" }).status,
    ).not.toBe(0);
  });
  it("runs migrations with recovery flags and redacts target credentials", () => {
    const f = fixture();
    const result = f.run("restore", [f.dump], {
      MIGRATION_DATABASE_URL: "postgresql://fixture@localhost/other-database",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("migrations executed");
    expect(result.stdout + result.stderr).not.toContain("private-password");
  });
});
