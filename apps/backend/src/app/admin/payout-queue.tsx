import { money } from "@/infrastructure/web";
import { CurrencyField } from "@/app/admin/currency-field";
import {
  claimOrderPayout,
  closeOrderPayoutAttempt,
  reconcileOrderPayout,
  resolveOrderPayoutDiscrepancy,
} from "@/app/actions";
import { Field, Hidden } from "@/app/components";
import type {
  AdminOperationsData,
  AdminOperationsInput,
} from "@/application/queries/admin-operations";
import { Button } from "@supastore/ui/button";
import { NativeSelect } from "@supastore/ui/native-select";
import { QueuePagination } from "./queue-pagination";
export function PayoutQueue({
  data,
  view,
  query,
  returnTo,
  payoutPage,
}: {
  data: AdminOperationsData;
  view: AdminOperationsInput["view"];
  query: Record<string, string | undefined>;
  returnTo: string;
  payoutPage: number;
}) {
  const { member, allocations, attempts, discrepancies, payoutHasNext } = data;
  return (
    <>
      {" "}
      {(view === "overview" || view === "payments") &&
        member.role === "owner" && (
          <section id="payouts">
            <h2>Payouts and discrepancies</h2>
            <QueuePagination
              query={query}
              path={returnTo}
              parameter="payoutPage"
              page={payoutPage}
              hasNext={payoutHasNext}
            />
            {allocations.length === 0 && (
              <p className="admin-empty">
                No payouts or discrepancies to review.
              </p>
            )}
            {allocations.map((allocation) => {
              const attempt = attempts.find(
                (item) => item.allocationId === allocation.id,
              );
              const discrepancy = attempt
                ? discrepancies.find(
                    (item) =>
                      item.payoutAttemptId === attempt.id &&
                      item.status === "open",
                  )
                : undefined;
              return (
                <details className="panel" key={allocation.id}>
                  <summary>
                    Payout allocation {allocation.id} ·{" "}
                    {money(
                      allocation.authorizedAmountCents,
                      data.store?.currency,
                      data.store?.precision,
                    )}
                  </summary>
                  {!attempt ? (
                    <form action={claimOrderPayout} className="mt-2">
                      <Hidden name="returnTo" value={returnTo} />
                      <Hidden name="allocationId" value={allocation.id} />
                      <CurrencyField label="Claim amount" name="amount" />
                      <NativeSelect
                        name="destinationType"
                        defaultValue="bank_account"
                      >
                        <option value="bank_account">Bank account</option>
                        <option value="card">Card</option>
                        <option value="cash">Cash</option>
                      </NativeSelect>
                      <Field
                        label="Verified return destination"
                        name="destination"
                      />
                      <Button type="submit" variant="outline">
                        Claim payout
                      </Button>
                    </form>
                  ) : (
                    <>
                      <p>
                        Attempt {attempt.id} · {attempt.status}
                      </p>
                      {attempt.status === "sending" && (
                        <form action={reconcileOrderPayout} className="mt-2">
                          <Hidden name="returnTo" value={returnTo} />
                          <Hidden name="attemptId" value={attempt.id} />
                          <CurrencyField
                            label="Actual payout amount"
                            name="actualAmount"
                          />
                          <Field
                            label="Transfer reference"
                            name="transferReference"
                          />
                          <NativeSelect
                            name="destinationType"
                            defaultValue="bank_account"
                          >
                            <option value="bank_account">Bank account</option>
                            <option value="card">Card</option>
                            <option value="cash">Cash</option>
                          </NativeSelect>
                          <Field
                            label="Actual destination"
                            name="destination"
                          />
                          <Button type="submit" variant="outline">
                            Reconcile payout
                          </Button>
                        </form>
                      )}
                      {discrepancy && (
                        <form
                          action={resolveOrderPayoutDiscrepancy}
                          className="mt-2"
                        >
                          <Hidden name="returnTo" value={returnTo} />
                          <Hidden name="discrepancyId" value={discrepancy.id} />
                          <CurrencyField
                            label="Write-off amount"
                            name="writeOff"
                          />
                          <Field label="Resolution reason" name="reason" />
                          <Button type="submit" variant="outline">
                            Resolve discrepancy
                          </Button>
                        </form>
                      )}
                      {!discrepancy && attempt.status !== "reconciled" && (
                        <form action={closeOrderPayoutAttempt} className="mt-2">
                          <Hidden name="returnTo" value={returnTo} />
                          <Hidden name="attemptId" value={attempt.id} />
                          <Field label="Closure reason" name="reason" />
                          <Button type="submit" variant="outline">
                            Close payout attempt
                          </Button>
                        </form>
                      )}
                    </>
                  )}
                </details>
              );
            })}
          </section>
        )}
    </>
  );
}
