import Link from "next/link";
import { db } from "@/infrastructure/db";
import { deliveryAreas } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { saveDeliveryArea } from "./actions";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import { Textarea } from "@supastore/ui/textarea";
import { Alert, AlertDescription } from "@supastore/ui/alert";
export default async function DeliverySettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await db.transaction(async (tx) =>
    verifyStaffInTransaction(tx, await staffIdentity(), "owner"),
  );
  const areas = await db
    .select()
    .from(deliveryAreas)
    .orderBy(deliveryAreas.name);
  const query = await searchParams;
  return (
    <main className="admin">
      <AdminNav />
      <h1>Local delivery areas</h1>
      <Notice error={query.error} />
      {query.saved && (
        <Alert>
          <AlertDescription>Delivery area saved.</AlertDescription>
        </Alert>
      )}
      <p>
        Configure eligible countries and postal prefixes. Empty prefixes allow
        all postal codes within the selected countries. Rates apply to each
        order. Enable scheduled delivery to offer windows with optional booking
        limits.
      </p>
      <Link href="/admin/settings/commerce">
        Enable local delivery in commerce policies
      </Link>
      {[...areas, null].map((area) => (
        <form
          action={saveDeliveryArea}
          key={area?.id || "new"}
          className="panel"
        >
          <h2>{area?.name || "Add area"}</h2>
          {area && <Hidden name="id" value={area.id} />}
          <Field label="Name" name="name" value={area?.name || ""} />
          <Field
            label="Country codes (comma separated)"
            name="countryCodes"
            value={area?.countryCodes.join(", ") || ""}
          />
          <Field
            label="Postal prefixes (optional, comma separated)"
            name="postalPrefixes"
            value={area?.postalPrefixes.join(", ") || ""}
            required={false}
          />
          <Field
            label="Delivery rate in minor currency units"
            name="rateCents"
            type="number"
            value={String(area?.rateCents || 0)}
          />
          <Field
            label="Free delivery merchandise threshold (optional)"
            name="freeThresholdCents"
            type="number"
            value={
              area?.freeThresholdCents == null
                ? ""
                : String(area.freeThresholdCents)
            }
            required={false}
          />
          <label>
            Weekly schedule JSON (e.g. {`{"mon":[["09:00","12:00"]]}`})
            <Textarea
              name="weeklySchedule"
              defaultValue={JSON.stringify(area?.weeklySchedule || {})}
              maxLength={12000}
            />
          </label>
          <Field
            label="Preparation minutes"
            name="prepMinutes"
            type="number"
            value={String(area?.prepMinutes ?? 0)}
          />
          <Field
            label="Orders per delivery window (blank = unlimited, 0 = closed)"
            name="slotCapacity"
            type="number"
            value={area?.slotCapacity == null ? "" : String(area.slotCapacity)}
            required={false}
          />
          <label className="flex items-center gap-2">
            <Checkbox
              name="scheduleRequired"
              defaultChecked={area?.scheduleRequired ?? false}
            />
            Require a delivery window
          </label>
          <label className="flex items-center gap-2">
            <Checkbox name="isActive" defaultChecked={area?.isActive ?? true} />
            Active
          </label>
          <Button type="submit">Save delivery area</Button>
        </form>
      ))}
    </main>
  );
}
