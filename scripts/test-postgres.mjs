import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import postgres from "postgres";
import { createDatabase } from "./init-db.mjs";
const pg = new EmbeddedPostgres({
  databaseDir: "./.test-postgres",
  user: "postgres",
  password: "postgres",
  port: 55432,
  persistent: true,
  initdbFlags: [
    "--encoding=UTF8",
    "--locale-provider=builtin",
    "--builtin-locale=PG_UNICODE_FAST",
  ],
  onLog: () => {},
  onError: console.error,
});
if (!existsSync("./.test-postgres/PG_VERSION")) await pg.initialise();
await pg.start();
const admin = postgres(
  "postgresql://postgres:postgres@127.0.0.1:55432/postgres",
);
try {
  await createDatabase(admin, "supastore");
} finally {
  await admin.end();
}
console.log("Test PostgreSQL ready on port 55432");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
