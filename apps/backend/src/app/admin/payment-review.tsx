import type { ReactNode } from "react";
import { receivePayment, confirmPayment } from "@/app/actions";
import { Field, Hidden } from "@/app/components";
import { PaymentSubmitButton } from "./payment-submit-button";
import { Checkbox } from "@supastore/ui/checkbox";
import { NativeSelect } from "@supastore/ui/native-select";
import { CurrencyField } from "./currency-field";

export function PaymentReview({
  order,
  accounts,
  returnTo,
  receiptSummary,
  currency,
  precision,
}: {
  order: { id: string; lifecycleStatus: string };
  accounts: {
    id: string;
    accountName: string;
    accountIdentifier: string;
    isActive: boolean;
  }[];
  returnTo: string;
  receiptSummary: ReactNode;
  currency: string;
  precision: number;
}) {
  const activeAccounts = accounts.filter((account) => account.isActive);
  return (
    <div className="payment-review-actions">
      <h3>Verify & record payment</h3>
      {receiptSummary}
      {["unpaid", "cancelled"].includes(order.lifecycleStatus) ? (
        <>
          {order.lifecycleStatus === "cancelled" && (
            <p>This order is cancelled. A late receipt will not reopen it.</p>
          )}
          <p>
            Check the actual receiving account. An uploaded image alone does not
            confirm payment.
          </p>
          <form action={receivePayment}>
            <Hidden name="orderId" value={order.id} />
            <Hidden name="returnTo" value={returnTo} />
            <label>
              Receiving account
              <NativeSelect
                name="accountId"
                aria-label="Receiving account"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Choose receiving account
                </option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName} — {account.accountIdentifier}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <CurrencyField
              currency={currency}
              precision={precision}
              name="amount"
              label="Actual received amount"
            />
            <Field name="reference" label="Actual payment reference" />
            <label className="check">
              <Checkbox name="verified" required />I verified the actual
              receiving account and amount.
            </label>
            <PaymentSubmitButton disabled={!activeAccounts.length}>
              Record receipt
            </PaymentSubmitButton>
            {!activeAccounts.length && (
              <p>
                No active receiving account. Ask an owner to configure one in
                Settings.
              </p>
            )}
          </form>
          {order.lifecycleStatus === "unpaid" && (
            <form action={confirmPayment}>
              <Hidden name="orderId" value={order.id} />
              <Hidden name="returnTo" value={returnTo} />
              <p>
                After recording receipts, confirm the order when its payment is
                fully covered. Amount and payout checks run before confirmation.
              </p>
              <PaymentSubmitButton variant="outline">
                Confirm exact payment
              </PaymentSubmitButton>
            </form>
          )}
        </>
      ) : (
        <p>
          This order is {order.lifecycleStatus}. Open payment management for
          corrections or returns.
        </p>
      )}
    </div>
  );
}
