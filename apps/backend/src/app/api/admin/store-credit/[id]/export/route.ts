import {
  ledgerTimestamp,
  ledgerBoundary,
  type LedgerCursor,
} from "@/infrastructure/db/ledger-cursor";
import { NextResponse } from "next/server";
import { and, asc, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  storeCreditAccounts,
  storeCreditEntries,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
function cell(value: unknown) {
  const text = String(value ?? "");
  const safe =
    typeof value === "string" && /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  let staff: string;
  try {
    staff = await staffIdentity();
    await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff);
      const [account] = await tx
        .select()
        .from(storeCreditAccounts)
        .where(eq(storeCreditAccounts.id, id));
      if (!account) throw new Error("Missing account");
    });
  } catch {
    return NextResponse.json(
      { error: "Credit account unavailable" },
      { status: 403 },
    );
  }
  let cursor: LedgerCursor | undefined;
  let header = false;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!header) {
          controller.enqueue(
            encoder.encode(
              "id,created_at,kind,amount_minor,reason,order_id,actor_id,reversal_of_id\r\n",
            ),
          );
          header = true;
          return;
        }
        const entries = await db.transaction(async (tx) => {
          await verifyStaffInTransaction(tx, staff);
          return tx
            .select({
              ...getTableColumns(storeCreditEntries),
              cursorTimestamp: ledgerTimestamp(storeCreditEntries.createdAt),
            })
            .from(storeCreditEntries)
            .where(
              and(
                eq(storeCreditEntries.accountId, id),
                ledgerBoundary(
                  storeCreditEntries.createdAt,
                  storeCreditEntries.id,
                  cursor,
                  true,
                ),
              ),
            )
            .orderBy(
              asc(storeCreditEntries.createdAt),
              asc(storeCreditEntries.id),
            )
            .limit(200);
        });
        if (!entries.length) {
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(
            entries
              .map((e) =>
                [
                  e.id,
                  e.cursorTimestamp,
                  e.kind,
                  e.amountCents,
                  e.reason,
                  e.orderId,
                  e.actorId,
                  e.reversalOfId,
                ]
                  .map(cell)
                  .join(","),
              )
              .join("\r\n") + "\r\n",
          ),
        );
        const last = entries[entries.length - 1]!;
        cursor = { timestamp: last.cursorTimestamp, id: last.id };
        if (entries.length < 200) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="store-credit-${id}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
