import Link from "next/link";
import { db } from "@/infrastructure/db";
import { deliveryAreas, storeSettings } from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { saveDeliveryArea } from "./actions";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import { WeeklyScheduleEditor } from "@/app/admin/weekly-schedule-editor";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { CurrencyField } from "@/app/admin/currency-field";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { Badge } from "@supastore/ui/badge";
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
  const [store] = await db.select().from(storeSettings).limit(1);
  const areaForm = (area: typeof deliveryAreas.$inferSelect | null) => (
    <form action={saveDeliveryArea} className="panel">
      <Notice error={query.error} />
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
      <CurrencyField
        label="Delivery rate"
        name="rateCents"
        value={String(area?.rateCents || 0)}
      />
      <CurrencyField
        label="Free delivery threshold"
        name="freeThresholdCents"
        value={
          area?.freeThresholdCents == null
            ? ""
            : String(area.freeThresholdCents)
        }
        required={false}
      />
      <WeeklyScheduleEditor value={area?.weeklySchedule ?? {}} />
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
  );
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
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
          order. Enable scheduled delivery to offer windows with optional
          booking limits.
        </p>
        <Link href="/admin/settings/commerce">
          Enable local delivery in commerce policies
        </Link>
        <div className="admin-page-actions">
          <AdminDialog
            key={areas.length}
            wide
            trigger="Add delivery area"
            title="Add delivery area"
          >
            {areaForm(null)}
          </AdminDialog>
        </div>
        <section className="panel">
          <h2>Delivery coverage</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Area</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {areas.map((area) => (
                <TableRow key={area.id}>
                  <TableCell>
                    <strong>{area.name}</strong>
                  </TableCell>
                  <TableCell>
                    {area.countryCodes.join(", ")}
                    <small>
                      {area.postalPrefixes.join(", ") || "All postal codes"}
                    </small>
                  </TableCell>
                  <TableCell>
                    {money(area.rateCents, store?.currency, store?.precision)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {area.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {area.scheduleRequired
                      ? "Window required"
                      : "No window required"}
                  </TableCell>
                  <TableCell>
                    <AdminDialog
                      wide
                      key={area.updatedAt.toISOString()}
                      trigger="Edit area"
                      title={"Edit " + area.name}
                    >
                      {areaForm(area)}
                    </AdminDialog>
                  </TableCell>
                </TableRow>
              ))}
              {!areas.length && (
                <TableRow>
                  <TableCell colSpan={6}>
                    No delivery areas yet. Add an area to configure coverage and
                    rates.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>{" "}
      </main>
    </>
  );
}
