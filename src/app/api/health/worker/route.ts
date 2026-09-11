import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/infrastructure/db';

export const dynamic = 'force-dynamic';

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
      WHERE status IN ('pending', 'retrying')
    `);

    const counts: Record<string, number> = {
      pending: 0,
      retrying: 0,
      delivered: 0,
      exhausted: 0,
    };

    if (Array.isArray(countsResult)) {
      for (const row of countsResult as any[]) {
        if (row.status && typeof row.count === 'number') {
          counts[row.status] = row.count;
        }
      }
    }

    const oldestDate = (oldestPendingResult as any)?.[0]?.oldest_pending;
    const oldestPendingAgeSeconds = oldestDate
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestDate).getTime()) / 1000))
      : 0;

    return NextResponse.json({
      status: 'ok',
      outbox: {
        pending: counts.pending,
        retrying: counts.retrying,
        delivered: counts.delivered,
        exhausted: counts.exhausted,
        oldestPendingAgeSeconds,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error?.message ?? 'Worker health check failed',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
