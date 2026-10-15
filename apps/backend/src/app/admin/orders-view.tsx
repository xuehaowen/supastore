import { CurrencyField } from "@/app/admin/currency-field";
import {
  cancelAdminOrder,
  confirmPayment,
  proposeChange,
  receiveCashPayment,
  receivePayment,
} from "@/app/actions";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { ManualOrderDialog } from "@/app/admin/manual-order-dialog";
import { Field, Hidden } from "@/app/components";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { Badge } from "@supastore/ui/badge";
import { Button, buttonVariants } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import { Input } from "@supastore/ui/input";
import { NativeSelect } from "@supastore/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import { money } from "@/infrastructure/web";
import { Download } from "lucide-react";
import type { OperationsScreenProps } from "./operations-types";
export function OrdersView(props: OperationsScreenProps) {
  const { data, query, view, returnTo } = props;
  const { member, rows, accounts, store, manualOrderVariants } = data;
  const managementRows = data.managedOrders.length
    ? data.managedOrders
    : data.rows;
  const { search, status, page } = props.filters;

  return (
    <>
      {view === "orders" && member.role === "owner" && (
        <div className="admin-page-actions">
          <ManualOrderDialog
            variants={manualOrderVariants.map((variant) => ({
              id: variant.id,
              label: `${variant.productTitle} · ${variant.variantTitle} · ${variant.sku}`,
            }))}
            paymentAccounts={accounts
              .filter((account) => account.isActive)
              .map((account) => ({
                id: account.id,
                label: account.accountName,
              }))}
          />
          <a
            href="/api/admin/exports/orders"
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <Download aria-hidden="true" />
            Export orders CSV
          </a>
          <a
            href="/api/admin/exports/orders?format=xlsx"
            download
            className={buttonVariants({ variant: "outline" })}
          >
            <Download aria-hidden="true" />
            Export orders XLSX
          </a>
        </div>
      )}
      {query.created && view === "orders" && (
        <Alert>
          <AlertDescription>
            Manual order {query.created} created.
          </AlertDescription>
        </Alert>
      )}
      {view === "orders" && (
        <form method="get" className="admin-filter-bar">
          <label>
            Search orders
            <Input
              name="q"
              defaultValue={search}
              placeholder="Reference, customer, or email"
            />
          </label>
          <label>
            Status
            <NativeSelect name="status" defaultValue={status}>
              <option value="">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="confirmed">Confirmed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
          </label>
          <Button type="submit">Filter</Button>
        </form>
      )}
      {view === "orders" && (
        <section className="panel">
          <h2>Order index</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 50).map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <a href={`/admin/orders/${order.id}`}>
                      <strong>{order.referenceCode}</strong>
                    </a>
                  </TableCell>
                  <TableCell>{order.guestName}</TableCell>
                  <TableCell>{order.guestEmail}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        order.lifecycleStatus === "completed" ||
                        order.lifecycleStatus === "confirmed"
                          ? "default"
                          : order.lifecycleStatus === "cancelled"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {order.lifecycleStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.fulfillmentType}</TableCell>
                  <TableCell>
                    {money(
                      order.purchaseTotalCents,
                      store?.currency,
                      store?.precision,
                    )}
                  </TableCell>
                  <TableCell>
                    <time dateTime={order.createdAt.toISOString()}>
                      {order.createdAt.toLocaleDateString("en-US", {
                        timeZone: "UTC",
                      })}
                    </time>
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      className="admin-edit-link"
                      href={`/admin/orders/${order.id}`}
                    >
                      View order
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <p className="admin-empty">No orders match these filters.</p>
          )}
          <nav className="admin-pagination" aria-label="Order pages">
            {page > 1 && (
              <a
                href={`/admin/orders?q=${encodeURIComponent(search)}&status=${status}&page=${page - 1}`}
              >
                ← Previous
              </a>
            )}
            {rows.length > 50 && (
              <a
                href={`/admin/orders?q=${encodeURIComponent(search)}&status=${status}&page=${page + 1}`}
              >
                Next →
              </a>
            )}
          </nav>
        </section>
      )}
      {view === "orders" && query.manage && (
        <AdminDialog
          defaultOpen
          title="Manage order payment"
          description="Record or confirm payment and update this order's financial terms."
        >
          <section className="admin-operation-dialog">
            {managementRows
              .filter(
                (o) =>
                  o.id === query.manage &&
                  (o.lifecycleStatus === "unpaid" ||
                    o.lifecycleStatus === "cancelled"),
              )
              .map((order) => (
                <details
                  className="panel"
                  id={`order-payment-${order.id}`}
                  key={order.id}
                  open={query.manage === order.id}
                >
                  <summary>
                    {order.referenceCode} · {order.guestName} ·{" "}
                    {money(
                      order.purchaseTotalCents,
                      store?.currency,
                      store?.precision,
                    )}
                  </summary>
                  <p>{order.guestEmail}</p>
                  <p>
                    <a href={`/admin/orders/${order.id}`}>Full order details</a>
                  </p>
                  {order.creditAppliedCents > 0 && (
                    <p>
                      Credit applied:{" "}
                      {money(
                        order.creditAppliedCents,
                        store?.currency,
                        store?.precision,
                      )}{" "}
                      · External total:{" "}
                      {money(
                        order.purchaseTotalCents - order.creditAppliedCents,
                        store?.currency,
                        store?.precision,
                      )}
                    </p>
                  )}
                  {order.lifecycleStatus === "cancelled" && (
                    <p>
                      Cancelled — record late payments for return. Recording a
                      receipt does not reopen the order.
                    </p>
                  )}
                  <form action={receivePayment}>
                    <Hidden name="returnTo" value={returnTo} />
                    <Hidden name="orderId" value={order.id} />
                    <label>
                      Actual receiving account
                      <NativeSelect name="accountId">
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountName} — {a.accountIdentifier}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                    <CurrencyField name="amount" label="Received amount" />
                    <Field
                      name="reference"
                      label="Actual bank / cash reference"
                    />
                    <label className="check">
                      <Checkbox name="verified" required />I verified this
                      receiving account and amount against the actual
                      transaction.
                    </label>
                    <Button type="submit">Record receipt</Button>
                  </form>
                  {order.lifecycleStatus === "unpaid" && (
                    <form action={confirmPayment}>
                      <Hidden name="returnTo" value={returnTo} />
                      <Hidden name="orderId" value={order.id} />
                      <Button type="submit" variant="outline">
                        Confirm exact payment
                      </Button>
                    </form>
                  )}
                  {member.role === "owner" &&
                    order.lifecycleStatus === "unpaid" && (
                      <form action={proposeChange}>
                        <Hidden name="returnTo" value={returnTo} />
                        <Hidden name="orderId" value={order.id} />
                        <CurrencyField label="Proposed total" name="total" />
                        <Field label="Reason" name="reason" />
                        <Button type="submit" variant="outline">
                          Propose new terms
                        </Button>
                      </form>
                    )}
                  {member.role === "owner" &&
                    order.lifecycleStatus === "unpaid" && (
                      <form action={cancelAdminOrder}>
                        <Hidden name="returnTo" value={returnTo} />
                        <Hidden name="orderId" value={order.id} />
                        <Field label="Cancellation reason" name="reason" />
                        <Button type="submit" variant="outline">
                          Cancel order
                        </Button>
                      </form>
                    )}
                  <form action={receiveCashPayment} className="mt-4">
                    <Hidden name="returnTo" value={returnTo} />
                    <Hidden name="orderId" value={order.id} />
                    <label>
                      Cash account
                      <NativeSelect name="accountId">
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.accountName}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                    <CurrencyField name="amount" label="Cash amount" />
                    <CurrencyField
                      name="tenderedAmount"
                      label="Tendered amount"
                    />
                    <Field name="payerName" label="Payer name" />
                    <Button type="submit" variant="outline">
                      Record cash receipt
                    </Button>
                  </form>
                </details>
              ))}
          </section>
        </AdminDialog>
      )}
    </>
  );
}
