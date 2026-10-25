import type { ReactNode } from "react";
import type { AdminOrderDetail } from "@/application/use-cases/orders/get-admin-order-detail";
import type { QuoteTerms } from "@/application/use-cases/get-quote";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { CurrencyField } from "@/app/admin/currency-field";
import { EvidenceImage } from "@/app/admin/evidence-image";
import { Checkbox } from "@supastore/ui/checkbox";
import { NativeSelect } from "@supastore/ui/native-select";
import {
  receivePayment,
  receiveCashPayment,
  confirmPayment,
  proposeChange,
} from "@/app/actions";

export function OrderPaymentSection({
  data,
  terms,
  format,
  identity,
}: {
  data: AdminOrderDetail;
  terms: QuoteTerms;
  format: (amount: number) => string;
  identity: ReactNode;
}) {
  const o = data.order;
  return (
    <>
      {["unpaid", "cancelled"].includes(o.lifecycleStatus) && (
        <section className="panel">
          <h2>Payment</h2>
          {o.lifecycleStatus === "cancelled" && (
            <p>
              This order is cancelled. Record late payments for return;
              recording a receipt does not reopen the order.
            </p>
          )}
          <AdminDialog
            wide={data.evidence.length > 0}
            trigger="Record payment"
            title="Record actual payment"
          >
            <div
              className={
                data.evidence.length ? "payment-evidence-workspace" : undefined
              }
            >
              {data.evidence.length > 0 && (
                <div>
                  <h3>Submitted evidence</h3>
                  {data.evidence.map((item) => (
                    <EvidenceImage
                      key={item.id}
                      id={item.id}
                      label={o.referenceCode}
                    />
                  ))}
                </div>
              )}
              <form action={receivePayment}>
                {identity}
                <label>
                  Receiving account
                  <NativeSelect name="accountId">
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <CurrencyField
                  currency={terms.currency}
                  precision={terms.precision}
                  name="amount"
                  label="Actual received amount"
                />
                <Field name="reference" label="Actual payment reference" />
                <label className="flex items-center gap-2">
                  <Checkbox name="verified" required />I verified the actual
                  receiving account and amount.
                </label>
                <Button type="submit">Record receipt</Button>
              </form>
            </div>
          </AdminDialog>
          <AdminDialog
            trigger="Record cash payment"
            title="Record cash payment"
          >
            <form action={receiveCashPayment}>
              {identity}
              <label>
                Cash account
                <NativeSelect name="accountId" required defaultValue="">
                  <option value="" disabled>
                    Choose a cash account
                  </option>
                  {data.accounts
                    .filter((a) => a.isActive && a.accountType === "cash")
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName}
                      </option>
                    ))}
                </NativeSelect>
              </label>
              {!data.accounts.some(
                (a) => a.isActive && a.accountType === "cash",
              ) && (
                <p>
                  No active cash account. Ask an owner to add one in Settings.
                </p>
              )}
              <CurrencyField
                name="amount"
                label="Cash amount"
                currency={terms.currency}
                precision={terms.precision}
              />
              <CurrencyField
                name="tenderedAmount"
                label="Tendered amount"
                currency={terms.currency}
                precision={terms.precision}
              />
              <Field name="payerName" label="Payer name" />
              <Button
                type="submit"
                disabled={
                  !data.accounts.some(
                    (a) => a.isActive && a.accountType === "cash",
                  )
                }
              >
                Record cash receipt
              </Button>
            </form>
          </AdminDialog>
          {o.lifecycleStatus === "unpaid" && (
            <form action={confirmPayment}>
              {identity}
              <Button type="submit">Confirm exact payment</Button>
            </form>
          )}
          {o.lifecycleStatus === "unpaid" && data.identity.role === "owner" && (
            <AdminDialog
              trigger="Propose new terms"
              title="Propose new order total"
              description="The customer must accept the proposed total before payment confirmation."
            >
              <form action={proposeChange}>
                {identity}
                <CurrencyField
                  name="total"
                  label="Proposed total"
                  currency={terms.currency}
                  precision={terms.precision}
                />
                <Field name="reason" label="Reason" />
                <Button type="submit">Propose new terms</Button>
              </form>
            </AdminDialog>
          )}
        </section>
      )}
    </>
  );
}
