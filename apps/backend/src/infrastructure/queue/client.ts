import { PgBoss, fromDrizzle } from "pg-boss";
import { sql } from "drizzle-orm";
import type { Transaction } from "@/application/common/transaction";
import { logFailure } from "@/infrastructure/http/failure";

/** Use pg-boss's supported adapter so job inserts share the caller's transaction. */
export function queueDatabase(executor: Pick<Transaction, "execute">) {
  return fromDrizzle(executor, sql);
}

// Share the pool across Next.js entry-point bundles and development hot reloads.
const processGlobal = globalThis as typeof globalThis & {
  __supastoreQueueProducer?: Promise<PgBoss> | undefined;
};
export function queueProducer() {
  return (processGlobal.__supastoreQueueProducer ??= (async () => {
    if (!process.env.DATABASE_URL)
      throw new Error("DATABASE_URL is required for queue producers.");
    // A separate bounded pool prevents startup deadlocks while the app holds a transaction,
    // including deployments configured with DB_POOL_MAX=1.
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 10000,
      migrate: false,
      createSchema: false,
      supervise: false,
      schedule: false,
      application_name: "supastore-queue-producer",
    });
    boss.on("error", (error) => logFailure(error, "queue.producer"));
    try {
      return await boss.start();
    } catch (error) {
      processGlobal.__supastoreQueueProducer = undefined;
      await boss.stop();
      throw error;
    }
  })());
}
export async function closeQueueProducer() {
  if (processGlobal.__supastoreQueueProducer) {
    const current = processGlobal.__supastoreQueueProducer;
    processGlobal.__supastoreQueueProducer = undefined;
    await (await current).stop();
  }
}

export async function enqueueWork(
  tx: Transaction,
  name: string,
  data: object,
  options: { id?: string; startAfter?: Date; singletonKey?: string } = {},
) {
  const boss = await queueProducer();
  return boss.send(name, data, { ...options, db: queueDatabase(tx) });
}
