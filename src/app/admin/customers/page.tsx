import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { orders } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/components";

export default async function CustomersPage() {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const contacts = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    return tx
      .select({
        email: orders.guestEmail,
        orderCount: sql<number>`count(*)::int`,
        lastOrder: sql<Date>`max(${orders.createdAt})`,
      })
      .from(orders)
      .groupBy(orders.guestEmail)
      .orderBy(desc(sql`max(${orders.createdAt})`))
      .limit(100);
  });
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">CUSTOMER DIRECTORY</p>
      <h1>Customers</h1>
      <p className="admin-description">
        Order contacts grouped by email. Showing up to 100 contacts, most recent
        first.
      </p>
      <section className="panel">
        <h2>Order contacts</h2>
        {contacts.length === 0 ? (
          <p className="admin-empty">
            Customers will appear here after their first order.
          </p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Orders</th>
                  <th>Latest order</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.email}>
                    <td>{contact.email}</td>
                    <td>{contact.orderCount}</td>
                    <td>
                      {new Date(contact.lastOrder).toLocaleDateString("en-US", {
                        timeZone: "UTC",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Link href="/admin/orders">Review orders →</Link>
      </section>
    </main>
  );
}
