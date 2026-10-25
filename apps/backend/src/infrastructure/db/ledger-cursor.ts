import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export type LedgerCursor = { timestamp: string; id: string };

export function parseLedgerCursor(value?: string): LedgerCursor | undefined {
  if (!value || value.length > 80) return undefined;
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)~([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
      value,
    );
  if (!match || match[1]!.startsWith("0000-")) return undefined;
  const milliseconds = match[1]!.slice(0, 23) + "Z";
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== milliseconds)
    return undefined;
  return { timestamp: match[1]!, id: match[2]! };
}

export function encodeLedgerCursor(timestamp: string, id: string): string {
  return encodeURIComponent(`${timestamp}~${id}`);
}

// Keep PostgreSQL microseconds: JavaScript Date truncation can skip same-millisecond entries.
export function ledgerTimestamp(column: AnyPgColumn) {
  return sql<string>`to_char(${sql`${column}`} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}

export function ledgerBoundary(
  createdAt: AnyPgColumn,
  id: AnyPgColumn,
  cursor?: LedgerCursor,
  ascending = false,
) {
  if (!cursor) return undefined;
  const tuple = sql`(${createdAt}, ${id})`;
  const boundary = sql`(${cursor.timestamp}::timestamptz, ${cursor.id}::uuid)`;
  return ascending ? sql`${tuple} > ${boundary}` : sql`${tuple} < ${boundary}`;
}
