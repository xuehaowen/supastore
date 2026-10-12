import { desc, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { promotions, promotionRedemptions } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { togglePromotion, upsertPromotion } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { queuePage, QueuePagination } from "@/app/admin/queue-pagination";

export default async function PromotionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; page?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const page = queuePage(query.page);
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return tx
      .select({
        promotion: promotions,
        redemptions: sql<number>`count(${promotionRedemptions.id})::int`,
      })
      .from(promotions)
      .leftJoin(
        promotionRedemptions,
        eq(promotionRedemptions.promotionId, promotions.id),
      )
      .groupBy(promotions.id)
      .orderBy(desc(promotions.createdAt), desc(promotions.id))
      .limit(51)
      .offset((page - 1) * 50);
  });
  const form = (promotion?: typeof promotions.$inferSelect) => (
    <form action={upsertPromotion} className="grid gap-4">
      {promotion && <Hidden name="id" value={promotion.id} />}
      <div className="two-col">
        <Field name="name" label="Promotion name" value={promotion?.name} />
        <Field name="code" label="Customer code" value={promotion?.code} />
      </div>
      <label>
        Discount type
        <NativeSelect
          name="discountType"
          defaultValue={promotion?.discountType ?? "percentage"}
        >
          <option value="percentage">Percentage (basis points)</option>
          <option value="fixed">Fixed minor-unit amount</option>
        </NativeSelect>
      </label>
      <div className="two-col">
        <Field
          name="discountValue"
          label="Discount value"
          type="number"
          value={promotion?.discountValue}
        />
        <Field
          name="minimumSubtotal"
          label="Minimum subtotal"
          type="number"
          value={promotion?.minimumSubtotalCents ?? 0}
        />
      </div>
      <div className="two-col">
        <Field
          name="usageLimit"
          label="Total usage limit"
          type="number"
          value={promotion?.usageLimit ?? ""}
          required={false}
        />
        <Field
          name="startsAt"
          label="Starts at"
          type="datetime-local"
          value={promotion?.startsAt?.toISOString().slice(0, 16) ?? ""}
          required={false}
        />
      </div>
      <Field
        name="endsAt"
        label="Ends at"
        type="datetime-local"
        value={promotion?.endsAt?.toISOString().slice(0, 16) ?? ""}
        required={false}
      />
      <label className="check">
        <Checkbox name="active" defaultChecked={promotion?.isActive ?? true} />
        Active
      </label>
      <Button type="submit">
        {promotion ? "Save promotion" : "Create promotion"}
      </Button>
    </form>
  );
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">SALES TOOLS</p>
      <h1>Promotions</h1>
      <p className="admin-description">
        Create limited coupon codes. Percentage values use basis points: 1000
        equals 10%.
      </p>
      <div className="admin-page-actions">
        <AdminDialog
          trigger="Create promotion"
          title="Create promotion"
          description="Configure a coupon code, eligibility window, and usage limit."
        >
          {form()}
        </AdminDialog>
      </div>
      <Notice error={query.error} />
      <div className="admin-grid">
        <section className="panel">
          <h2>Promotion codes</h2>
          {rows.slice(0, 50).map(({ promotion, redemptions }) => (
            <details className="panel" key={promotion.id}>
              <summary>
                {promotion.code} · {promotion.name} ·{" "}
                {promotion.isActive ? "Active" : "Inactive"} · {redemptions}{" "}
                uses
              </summary>
              {form(promotion)}
              <form action={togglePromotion}>
                <Hidden name="promotionId" value={promotion.id} />
                <Hidden name="active" value={String(!promotion.isActive)} />
                <Button type="submit" variant="outline">
                  {promotion.isActive ? "Deactivate" : "Activate"}
                </Button>
              </form>
            </details>
          ))}
          {!rows.length && <p className="admin-empty">No promotions yet.</p>}
          <QueuePagination
            query={query}
            path="/admin/promotions"
            parameter="page"
            page={page}
            hasNext={rows.length > 50}
          />
        </section>
      </div>
    </main>
  );
}
