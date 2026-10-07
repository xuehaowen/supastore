import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/infrastructure/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        error: 'Database query failed',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
