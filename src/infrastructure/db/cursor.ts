import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "./index";

/** Caller owns the transaction; PostgreSQL closes portals on rollback. */
export async function* databaseCursor(
  tx: Pick<Database, "execute">,
  query: SQL,
) {
  const name = sql.identifier(
    `report_cursor_${randomUUID().replaceAll("-", "")}`,
  );
  await tx.execute(sql`DECLARE ${name} NO SCROLL CURSOR FOR ${query}`);
  let failed = false;
  try {
    while (true) {
      const rows = await tx.execute<Record<string, unknown>>(
        sql`FETCH FORWARD 500 FROM ${name}`,
      );
      for (const row of rows) yield row;
      if (rows.length < 500) break;
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!failed) await tx.execute(sql`CLOSE ${name}`);
  }
}
