import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, isNull, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { orders, customers } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field } from "@/app/components";
import { Button } from "@/components/ui/button";
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; guests?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login")),
    query = await searchParams;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const search = (query.q || "").slice(0, 120),
    pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    const profiles = await tx
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        orderCount: sql<number>`(select count(*)::int from orders where customer_id=${sql`${customers.id}`})`,
      })
      .from(customers)
      .where(
        sql`(${customers.email} ilike ${pattern} or ${customers.name} ilike ${pattern})`,
      )
      .orderBy(desc(customers.createdAt), desc(customers.id))
      .limit(26)
      .offset((page - 1) * 25);
    const guests = query.guests
      ? await tx
          .select({
            email: orders.guestEmail,
            orderCount: sql<number>`count(*)::int`,
          })
          .from(orders)
          .where(
            and(
              isNull(orders.customerId),
              sql`${orders.guestEmail} ilike ${pattern}`,
            ),
          )
          .groupBy(orders.guestEmail)
          .orderBy(orders.guestEmail)
          .limit(26)
          .offset((page - 1) * 25)
      : [];
    return { profiles, guests };
  });
  const rows = query.guests ? data.guests : data.profiles;
  const href = (p: number) =>
    `?${new URLSearchParams({ q: search, page: String(p), ...(query.guests ? { guests: "1" } : {}) })}`;
  return (
    <main className="admin">
      <AdminNav />
      <h1>Customers</h1>
      <p className="admin-description">
        Verified customer profiles own their orders and store credit. Guest
        contact summaries do not establish account ownership.
      </p>
      <nav className="my-5 flex gap-4">
        <Link href="/admin/customers">Customer profiles</Link>
        <Link href="?guests=1">Guest order contacts</Link>
      </nav>
      <form method="get" className="filter-bar">
        {query.guests && <input type="hidden" name="guests" value="1" />}
        <Field
          name="q"
          label="Search customers"
          value={search}
          required={false}
        />
        <Button type="submit">Search</Button>
      </form>
      <section className="panel">
        <h2>{query.guests ? "Guest order contacts" : "Customer profiles"}</h2>
        <div className="admin-table-scroll">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Email</th>
                <th>Orders</th>
              </tr>
            </thead>
            <tbody>
              {query.guests
                ? data.guests.slice(0, 25).map((g) => (
                    <tr key={g.email}>
                      <td>Guest contact</td>
                      <td>{g.email}</td>
                      <td>{g.orderCount}</td>
                    </tr>
                  ))
                : data.profiles.slice(0, 25).map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/admin/customers/${c.id}`}>
                          {c.name || c.email}
                        </Link>
                      </td>
                      <td>{c.email}</td>
                      <td>{c.orderCount}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
        {!rows.length && <p>No customers match this view.</p>}
      </section>
      <nav className="pager" aria-label="Customer pages">
        {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
        <span>Page {page}</span>
        {rows.length > 25 && <Link href={href(page + 1)}>Next</Link>}
      </nav>
    </main>
  );
}
