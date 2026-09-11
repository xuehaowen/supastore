import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const pg = new EmbeddedPostgres({
  databaseDir: "./.test-postgres",
  user: "postgres",
  password: "postgres",
  port: 55432,
  persistent: true,
  onLog: () => {},
  onError: console.error,
});
if (!existsSync("./.test-postgres/PG_VERSION")) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("supastore");
} catch (error) {
  if (!String(error).includes("already exists")) throw error;
}
console.log("Test PostgreSQL ready on port 55432");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
