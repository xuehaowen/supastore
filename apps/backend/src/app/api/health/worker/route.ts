import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { queueWorkerHealth } from "@/infrastructure/queue/health";
import { logFailure } from "@/infrastructure/http/failure";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const countsResult = await db.execute(sql`
      SELECT 
        status,
        COUNT(*)::int as count
      FROM event_deliveries
      GROUP BY status
    `);

    const oldestPendingResult = await db.execute(sql`
      SELECT MIN(created_at) as oldest_pending
      FROM event_deliveries
      WHERE status IN ('pending', 'retrying', 'dispatching')
    `);

    const counts: Record<string, number> = {
      pending: 0,
      retrying: 0,
      delivered: 0,
      exhausted: 0,
      dispatching: 0,
      awaiting: 0,
      review: 0,
      accepted: 0,
      sent: 0,
      failed: 0,
      suppressed: 0,
    };

    if (Array.isArray(countsResult)) {
      for (const row of countsResult) {
        if (
          typeof row.status === "string" &&
          Object.hasOwn(counts, row.status) &&
          Number.isSafeInteger(row.count) &&
          Number(row.count) >= 0
        ) {
          counts[row.status] = Number(row.count);
        }
      }
    }

    const oldestDate = Array.isArray(oldestPendingResult)
      ? oldestPendingResult[0]?.oldest_pending
      : undefined;
    const oldestPendingAgeSeconds = oldestDate
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(String(oldestDate)).getTime()) / 1000,
          ),
        )
      : 0;

    const worker = await queueWorkerHealth();
    const status =
      worker.status === "ok" &&
      (counts.review > 0 || counts.exhausted > 0 || counts.failed > 0)
        ? "degraded"
        : worker.status;
    return NextResponse.json(
      {
        status,
        worker,
        outbox: {
          pending: counts.pending,
          retrying: counts.retrying,
          delivered: counts.delivered,
          exhausted: counts.exhausted,
          dispatching: counts.dispatching,
          awaiting: counts.awaiting,
          review: counts.review,
          accepted: counts.accepted,
          sent: counts.sent,
          failed: counts.failed,
          suppressed: counts.suppressed,
          oldestPendingAgeSeconds: Number.isFinite(oldestPendingAgeSeconds)
            ? oldestPendingAgeSeconds
            : 0,
        },
        timestamp: new Date().toISOString(),
      },
      {
        status: status === "ok" ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    logFailure(error, "health.worker");
    return NextResponse.json(
      {
        status: "unhealthy",
        error: "Worker health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
