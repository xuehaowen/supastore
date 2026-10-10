import { AdminDialog } from "@/app/admin/admin-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/infrastructure/web";
import type { OperationsScreenProps } from "./operations-types";
import { QueuePagination } from "./queue-pagination";
export function PaymentsView(props: OperationsScreenProps) {
  const { data, query, view, returnTo } = props;
  const { rows, paymentRows, evidence, evidenceHasNext, store } = data;
  const {
    paymentSearch,
    paymentStatus,
    paymentType,
    paymentPage,
    evidencePage,
  } = props.filters;

  return (
    <>
      {view === "payments" && (
        <>
          <form method="get" className="admin-filter-bar payment-filter-bar">
            <label>
              Search payments
              <Input
                name="paymentQ"
                defaultValue={paymentSearch}
                placeholder="Customer, order, or reference"
              />
            </label>
            <label>
              Order status
              <NativeSelect name="paymentStatus" defaultValue={paymentStatus}>
                <option value="">All statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </NativeSelect>
            </label>
            <label>
              Payment type
              <NativeSelect name="paymentType" defaultValue={paymentType}>
                <option value="">All types</option>
                <option value="cash">Cash</option>
                <option value="zelle">Zelle</option>
                <option value="venmo">Venmo</option>
                <option value="other">Other</option>
              </NativeSelect>
            </label>
            <Button type="submit">Filter</Button>
          </form>
          <section className="panel">
            <h2>Payment ledger</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment reference</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Order status</TableHead>
                  <TableHead>Payment type</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentRows.slice(0, 50).map(({ receipt, order, account }) => (
                  <TableRow key={receipt.id}>
                    <TableCell>
                      <strong>{receipt.normalizedReference}</strong>
                    </TableCell>
                    <TableCell>{order.referenceCode}</TableCell>
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
                    <TableCell className="capitalize">
                      {account.accountType}
                    </TableCell>
                    <TableCell>{account.accountName}</TableCell>
                    <TableCell>
                      {money(
                        receipt.amountCents,
                        store?.currency,
                        store?.precision,
                      )}
                    </TableCell>
                    <TableCell>
                      <time dateTime={receipt.createdAt.toISOString()}>
                        {receipt.createdAt.toLocaleDateString("en-US", {
                          timeZone: "UTC",
                        })}
                      </time>
                    </TableCell>
                    <TableCell className="text-right">
                      <a
                        className="admin-edit-link"
                        href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&managePayment=${order.id}#payment-${order.id}`}
                      >
                        Manage
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {paymentRows.length === 0 && (
              <p className="admin-empty">No payments match these filters.</p>
            )}
            <nav className="admin-pagination" aria-label="Payment pages">
              {paymentPage > 1 && (
                <a
                  href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&paymentPage=${paymentPage - 1}`}
                >
                  ← Previous
                </a>
              )}
              {paymentRows.length > 50 && (
                <a
                  href={`/admin/payments?paymentQ=${encodeURIComponent(paymentSearch)}&paymentStatus=${paymentStatus}&paymentType=${paymentType}&paymentPage=${paymentPage + 1}`}
                >
                  Next →
                </a>
              )}
            </nav>
          </section>
        </>
      )}
      {view === "payments" && (
        <section id="evidence">
          <h2>Payment evidence review</h2>
          <QueuePagination
            query={query}
            path={returnTo}
            parameter="evidencePage"
            page={evidencePage}
            hasNext={evidenceHasNext}
          />
          {evidence.length === 0 && (
            <p className="admin-empty">No payment evidence awaiting review.</p>
          )}
          <div className="evidence-grid">
            {evidence.map((item) => {
              const order = rows.find((row) => row.id === item.orderId);
              const label = order?.referenceCode ?? item.orderId;
              return (
                <article className="evidence-card" key={item.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated evidence redirects cannot use the image optimizer */}
                  <img
                    src={`/api/evidence/${item.id}`}
                    alt={`Payment evidence submitted for order ${label}`}
                  />
                  <div>
                    <strong>{label}</strong>
                    <AdminDialog
                      trigger="Review evidence"
                      title={`Payment evidence · ${label}`}
                      description="Compare this image with the receiving account and recorded amount before confirming payment."
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated evidence redirects cannot use the image optimizer */}
                      <img
                        className="evidence-review-image"
                        src={`/api/evidence/${item.id}`}
                        alt={`Full-size payment evidence submitted for order ${label}`}
                      />
                      <a
                        className="admin-edit-link"
                        href={`/api/evidence/${item.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open original in a new tab ↗
                      </a>
                    </AdminDialog>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
