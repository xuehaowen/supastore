import { correctReceipt } from "@/application/use-cases/payments/correct-receipt";
import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, queryClient as sql } from "@/infrastructure/db";
import {
  claimPayout,
  reconcilePayout,
  closePayoutAttempt,
  resolvePayoutDiscrepancy,
} from "@/application/use-cases/refund-payout";

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    url.pathname !== "/supastore_test" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Requires isolated integration database");
  await migrate(db, { migrationsFolder: "src/infrastructure/db/migrations" });
});
afterAll(() => sql.end());
it.each(["claim", "reconcile", "close", "resolve", "correct"])(
  "%s waits for the owning order lock before changing payout state",
  async (command) => {
    const owner = randomUUID();
    await sql`insert into staff_memberships(user_id,email,role) values(${owner},${owner + "@example.test"},'owner')`;
    const [cart] =
      await sql`insert into carts(guest_session_id) values(${randomUUID()}) returning id`;
    const [quote] =
      await sql`insert into quotes(cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at) values(${cart!.id},1,1000,0,0,0,1000,'[]','{}',now()+interval '15 minutes') returning id`;
    const [order] =
      await sql`insert into orders(source_cart_id,quote_id,reference_code,purchase_total_cents,guest_email,guest_name,shipping_address_snapshot) values(${cart!.id},${quote!.id},${randomUUID()},1000,'test@example.test','Lock customer','{}') returning id`;
    const [account] =
      await sql`insert into payment_accounts(account_identifier,account_name) values(${randomUUID()},'Synthetic') returning id`;
    const [receipt] =
      await sql`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id) values(${order!.id},${account!.id},1100,${randomUUID()},${randomUUID()},${owner}) returning id`;
    const [paymentReturn] =
      await sql`insert into payment_returns(order_id,kind,amount_cents,reason) values(${order!.id},'excess_return',100,'Test') returning id`;
    const [allocation] =
      await sql`insert into payout_allocations(payment_return_id,receipt_id,authorized_amount_cents) values(${paymentReturn!.id},${receipt!.id},100) returning id`;
    const [verification] =
      await sql`insert into payout_destination_verifications(receipt_id,destination_data,verified_by_user_id) values(${receipt!.id},'{"type":"cash"}',${owner}) returning id`;
    const [attempt] = ["claim", "correct"].includes(command)
      ? []
      : await sql`insert into payout_attempts(allocation_id,destination_verification_id,claimed_amount_cents,claimed_by_user_id,status) values(${allocation!.id},${verification!.id},100,${owner},${command === "resolve" ? "reconciliation_required" : "sending"}) returning id`;
    const [discrepancy] =
      command === "resolve"
        ? await sql`insert into payout_discrepancies(payout_attempt_id,reason) values(${attempt!.id},'Test hold') returning id`
        : [];
    let otherReceiptId: string | undefined;
    if (command === "correct") {
      const [other] =
        await sql`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id) values(${order!.id},${account!.id},200,${randomUUID()},${randomUUID()},${owner}) returning id`;
      otherReceiptId = other!.id;
      await sql`insert into payment_receipt_corrections(receipt_id,delta_amount_cents,reason,corrected_by_user_id) values(${other!.id},-100,'Prior correction',${owner})`;
      await sql`insert into payout_allocations(payment_return_id,receipt_id,authorized_amount_cents,settled_amount_cents) values(${paymentReturn!.id},${other!.id},100,100)`;
    }
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    let locked!: (pid: number) => void;
    const ready = new Promise<number>((resolve) => {
      locked = resolve;
    });
    const blocker = sql.begin(async (tx) => {
      await tx`select id from orders where id=${order!.id} for update`;
      const [row] = await tx`select pg_backend_pid() as pid`;
      locked(row!.pid);
      await gate;
    });
    const pid = await ready;
    const operation =
      command === "correct"
        ? correctReceipt({
            receiptId: receipt!.id,
            deltaAmountCents: -1,
            reason: "Lock regression",
            ownerUserId: owner,
          })
        : command === "claim"
          ? claimPayout({
              allocationId: allocation!.id,
              ownerUserId: owner,
              claimedAmountCents: 100,
              destination: { type: "cash" },
            })
          : command === "reconcile"
            ? reconcilePayout({
                attemptId: attempt!.id,
                ownerUserId: owner,
                actualAmountCents: 100,
                transferReference: randomUUID(),
                actualDestination: { type: "cash" },
              })
            : command === "close"
              ? closePayoutAttempt({
                  attemptId: attempt!.id,
                  ownerUserId: owner,
                  reason: "No transfer",
                })
              : resolvePayoutDiscrepancy({
                  discrepancyId: discrepancy!.id,
                  ownerUserId: owner,
                  writeOffCents: 0,
                  resolutionReason: "Reviewed",
                });
    const result = operation.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    try {
      await expect
        .poll(
          async () =>
            Number(
              (
                await sql`select count(*) as count from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`
              )[0]!.count,
            ),
          { timeout: 2000 },
        )
        .toBeGreaterThan(0);
      if (command === "correct") {
        // While correction waits for the order it must not hold its receipt lock.
        await sql.begin(async (tx) => {
          await tx`select id from payment_receipts where id=${receipt!.id} for update nowait`;
        });
      }
    } finally {
      unlock();
      await blocker;
      const outcome = await result;
      if ("error" in outcome) throw outcome.error;
      if (command === "correct") {
        const corrected = outcome.value as Awaited<
          ReturnType<typeof correctReceipt>
        >;
        expect(corrected.projection.totalReceivedCents).toBe(1199);
        expect(corrected.projection.totalSettledNonPurchaseReturnsCents).toBe(
          100,
        );
        expect(
          corrected.projection.receipts.find((r) => r.id === otherReceiptId)
            ?.effectiveReceivedCents,
        ).toBe(100);
        await sql`insert into confirmation_funding(order_id,receipt_id,funded_amount_cents) values(${order!.id},${receipt!.id},1000)`;
        await sql`update orders set lifecycle_status='cancelled' where id=${order!.id}`;
        const cancelled = await correctReceipt({
          receiptId: receipt!.id,
          deltaAmountCents: -300,
          reason: "Correction after confirmed cancellation",
          ownerUserId: owner,
        });
        expect(
          cancelled.projection.operationalFundingShortfallCents,
        ).toBeGreaterThan(0);
      }
    }
  },
);
