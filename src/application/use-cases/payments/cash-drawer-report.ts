import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  paymentReceipts,
  paymentAccounts,
  cashReceiptDetails,
  cashDrawerSessions,
  staffMemberships,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { NotFoundError } from "@/application/common/errors";

export interface CashDrawerReportInput {
  actorUserId: string;
  cashDrawerSessionId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface CashReceiptSummaryItem {
  receiptId: string;
  orderId: string;
  sequentialNumber: string;
  amountCents: number;
  tenderedAmountCents: number;
  changeDueCents: number;
  payerName: string | null;
  recordedByUserId: string;
  createdAt: Date;
}

export interface CashDrawerReportOutput {
  drawerName: string;
  status: "open" | "closed" | "summary";
  periodStart: Date;
  periodEnd: Date;
  startingFloatCents: number;
  totalCashCollectedCents: number;
  cashReceiptsCount: number;
  totalChangeGivenCents: number;
  expectedDrawerBalanceCents: number;
  closingBalanceCents: number | null;
  varianceCents: number | null;
  receipts: CashReceiptSummaryItem[];
}

export async function generateCashDrawerReport(
  input: CashDrawerReportInput
): Promise<CashDrawerReportOutput> {
  return await db.transaction(async (tx) => {
    // 1. In-transaction staff verification
    await verifyStaffInTransaction(tx, input.actorUserId);

    let drawerName = "All Cash Drawers";
    let status: "open" | "closed" | "summary" = "summary";
    let startingFloatCents = 0;
    let closingBalanceCents: number | null = null;
    let periodStart = input.startDate || new Date(new Date().setHours(0, 0, 0, 0));
    let periodEnd = input.endDate || new Date();

    if (input.cashDrawerSessionId) {
      const [session] = await tx
        .select()
        .from(cashDrawerSessions)
        .where(eq(cashDrawerSessions.id, input.cashDrawerSessionId))
        .limit(1);

      if (!session) {
        throw new NotFoundError(
          `Cash drawer session '${input.cashDrawerSessionId}' not found.`
        );
      }

      drawerName = session.drawerName;
      status = session.status as "open" | "closed";
      startingFloatCents = session.startingBalanceCents;
      closingBalanceCents = session.closingBalanceCents;
      periodStart = session.openedAt;
      if (session.closedAt) {
        periodEnd = session.closedAt;
      }
    }

    // Query all cash receipts in the session / period
    const rows = await tx
      .select({
        receiptId: paymentReceipts.id,
        orderId: paymentReceipts.orderId,
        sequentialNumber: cashReceiptDetails.sequentialNumber,
        amountCents: paymentReceipts.amountCents,
        tenderedAmountCents: cashReceiptDetails.tenderedAmountCents,
        changeDueCents: cashReceiptDetails.changeDueCents,
        payerName: cashReceiptDetails.payerName,
        recordedByUserId: paymentReceipts.recordedByUserId,
        createdAt: paymentReceipts.createdAt,
      })
      .from(paymentReceipts)
      .innerJoin(
        cashReceiptDetails,
        eq(cashReceiptDetails.receiptId, paymentReceipts.id)
      )
      .where(
        and(
          gte(paymentReceipts.createdAt, periodStart),
          lte(paymentReceipts.createdAt, periodEnd),
          input.cashDrawerSessionId
            ? eq(
                cashReceiptDetails.cashDrawerSessionId,
                input.cashDrawerSessionId
              )
            : undefined
        )
      );

    const totalCashCollectedCents = rows.reduce(
      (sum, r) => sum + r.amountCents,
      0
    );
    const totalChangeGivenCents = rows.reduce(
      (sum, r) => sum + r.changeDueCents,
      0
    );
    const expectedDrawerBalanceCents =
      startingFloatCents + totalCashCollectedCents;

    const varianceCents =
      closingBalanceCents !== null
        ? closingBalanceCents - expectedDrawerBalanceCents
        : null;

    return {
      drawerName,
      status,
      periodStart,
      periodEnd,
      startingFloatCents,
      totalCashCollectedCents,
      cashReceiptsCount: rows.length,
      totalChangeGivenCents,
      expectedDrawerBalanceCents,
      closingBalanceCents,
      varianceCents,
      receipts: rows,
    };
  });
}
