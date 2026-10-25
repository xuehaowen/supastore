import { StorefrontSettings } from "./storefront-settings";
import { PaymentSettings } from "./payment-settings";
import { StaffSettings } from "./staff-settings";
import { PickupSettings } from "./pickup-settings";
import { AdminDialog } from "../admin-dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { redirect } from "next/navigation";
import { SettingsDirectory } from "./settings-directory";
import { db } from "@/infrastructure/db";
import {
  storeSettings,
  paymentAccounts,
  pickupLocation,
  shippingZones,
  staffMemberships,
} from "@/infrastructure/db/schema";
import { staffIdentity, money } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  sendVerification,
  setupOwner,
  saveSettings,
  saveShipping,
} from "@/app/actions";
import { Field, Hidden, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import { NativeSelect } from "@supastore/ui/native-select";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { LaunchChecklist } from "../launch-checklist";
import { getLaunchReadiness } from "@/application/use-cases/store/get-launch-readiness";
export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    sent?: string;
    staff?: string;
    heroSearch?: string;
  }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const [store] = await db.select().from(storeSettings).limit(1);
  const q = await searchParams;
  if (!store?.isBootstrapCompleted)
    return (
      <main id="admin-content" tabIndex={-1} className="narrow standalone">
        <h1>Create your store</h1>
        <Notice error={q.error} />
        <form action={setupOwner}>
          <Field label="Store name" name="storeName" />
          <Field label="One-time setup secret" name="secret" type="password" />
          <Button type="submit">Create store</Button>
        </form>
      </main>
    );
  await db
    .transaction((tx) => verifyStaffInTransaction(tx, staff, "owner"))
    .catch(() => redirect("/admin/login"));
  const accounts = await db.select().from(paymentAccounts);
  const zones = await db
    .select()
    .from(shippingZones)
    .orderBy(shippingZones.sortOrder);
  const locations = await db
    .select()
    .from(pickupLocation)
    .orderBy(pickupLocation.name);
  const staffMembers = await db.select().from(staffMemberships);
  const readiness = await getLaunchReadiness();
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <p className="eyebrow">WORKSPACE SETTINGS</p>
        <h1>Store setup</h1>
        <p className="admin-description">
          Configure your store, payment methods, fulfillment, and team access.
        </p>
        <Notice error={q.error} />
        <LaunchChecklist checklist={readiness.checklist} />
        <SettingsDirectory />
        <div className="admin-grid setup-sections">
          <StorefrontSettings
            hero={store.storefrontHero}
            storeName={store.storeName}
            defaultLocale={store.defaultLocale}
            search={q.heroSearch?.slice(0, 120) ?? ""}
          />
          <section className="panel">
            <h2 id="store-profile">Store profile & taxes</h2>
            <form action={saveSettings}>
              <Field
                label="Store name"
                name="storeName"
                value={store.storeName}
              />
              <Field
                label="Support email"
                name="supportEmail"
                type="email"
                value={store.supportEmail}
              />
              <Field
                label="Logo asset key"
                name="logoKey"
                value={store.logoKey ?? ""}
                required={false}
              />
              <div className="two-col">
                <Field
                  label="Currency"
                  name="currency"
                  value={store.currency}
                />
                <Field
                  label="Decimal places"
                  name="precision"
                  type="number"
                  value={store.precision}
                />
              </div>
              <label>
                Default language
                <NativeSelect
                  name="defaultLocale"
                  defaultValue={store.defaultLocale}
                >
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </NativeSelect>
              </label>
              <Field label="Timezone" name="timezone" value={store.timezone} />
              <Field
                label="Tax rate (basis points)"
                name="taxRate"
                type="number"
                value={store.taxRateBasisPoints}
              />
              <label className="check">
                <Checkbox
                  name="taxInclusive"
                  defaultChecked={store.isTaxInclusive}
                />
                Prices include tax
              </label>
              <Button type="submit">Save profile</Button>
            </form>
          </section>
          <section className="panel">
            <h2 id="shipping">Shipping zones</h2>
            <p>
              Regional zones require one country. Use state codes (CA, OR, WA)
              or ZIP/postal prefixes, comma separated. If both are set, both
              must match. Postal rules take priority, then state rules, then
              country rates. For equal specificity, lower priority numbers win;
              use distinct numbers for overlapping rules. Keep a country-only
              zone for other destinations.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zone</TableHead>
                  <TableHead>Countries</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Free shipping from</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((zone) => (
                  <TableRow key={zone.id}>
                    <TableCell>{zone.name}</TableCell>
                    <TableCell>
                      {zone.countryCodes?.join(", ") || "All countries"}
                    </TableCell>
                    <TableCell>{zone.sortOrder}</TableCell>
                    <TableCell>
                      {money(zone.rateCents, store.currency, store.precision)}
                    </TableCell>
                    <TableCell>
                      {zone.freeThresholdCents === null
                        ? "Not offered"
                        : money(
                            zone.freeThresholdCents,
                            store.currency,
                            store.precision,
                          )}
                    </TableCell>
                    <TableCell>
                      <AdminDialog
                        key={zone.updatedAt.toISOString()}
                        trigger="Edit zone"
                        title={"Edit " + zone.name}
                      >
                        {" "}
                        <form
                          action={saveShipping}
                          className="category-admin-row grid gap-3"
                        >
                          <Notice error={q.error} />
                          <Hidden name="zoneId" value={zone.id} />
                          <Field
                            label="Zone name"
                            name="zoneName"
                            value={zone.name}
                          />
                          <Field
                            label="Country codes, comma separated; blank for all"
                            name="countries"
                            value={zone.countryCodes?.join(", ") ?? ""}
                            required={false}
                          />
                          <Field
                            label="Flat rate (minor units)"
                            name="rate"
                            type="number"
                            value={zone.rateCents}
                          />
                          <Field
                            label="State/region codes, comma separated; blank for all"
                            name="regions"
                            value={zone.regionCodes.join(", ")}
                            required={false}
                          />
                          <Field
                            label="ZIP/postal prefixes, comma separated; blank for all"
                            name="postalPrefixes"
                            value={zone.postalPrefixes.join(", ")}
                            required={false}
                          />
                          <Field
                            label="Priority (lower wins for equally specific zones)"
                            name="sortOrder"
                            type="number"
                            value={zone.sortOrder}
                          />
                          <Field
                            label="Free shipping threshold (minor units)"
                            name="freeThreshold"
                            type="number"
                            value={zone.freeThresholdCents ?? ""}
                            required={false}
                          />
                          <Button type="submit" variant="outline">
                            Save shipping zone
                          </Button>
                        </form>
                      </AdminDialog>
                    </TableCell>
                  </TableRow>
                ))}
                {!zones.length && (
                  <TableRow>
                    <TableCell colSpan={6}>No shipping zones yet.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <AdminDialog
              key={zones.length}
              trigger="Add shipping zone"
              title="Add shipping zone"
            >
              {" "}
              <form action={saveShipping}>
                <Notice error={q.error} />
                <Field label="Zone name" name="zoneName" />
                <Field
                  label="Priority (lower wins for equally specific zones)"
                  name="sortOrder"
                  type="number"
                  value="0"
                />
                <Field
                  label="State/region codes, comma separated; blank for all"
                  name="regions"
                  required={false}
                />
                <Field
                  label="ZIP/postal prefixes, comma separated; blank for all"
                  name="postalPrefixes"
                  required={false}
                />
                <Field
                  label="Country codes, comma separated; blank for all"
                  name="countries"
                  required={false}
                />
                <Field
                  label="Flat rate (minor units)"
                  name="rate"
                  type="number"
                  value="500"
                />
                <Field
                  label="Free shipping threshold (minor units)"
                  name="freeThreshold"
                  type="number"
                  required={false}
                />
                <Button type="submit">Save shipping zone</Button>
              </form>
            </AdminDialog>
            <h2 id="pickup">Pickup locations</h2>
            <PickupSettings locations={locations} error={q.error} />
          </section>
          <section className="panel">
            <h2 id="payment-methods">Payment methods & email delivery</h2>
            {q.sent && (
              <Alert>
                <AlertDescription>
                  Verification email accepted by the mail server. Check the
                  owner account inbox and spam folder.
                </AlertDescription>
              </Alert>
            )}
            <p>
              {store.emailVerifiedAt
                ? "Email delivery verified"
                : "Verify that store email reaches your inbox."}
            </p>
            <form action={sendVerification}>
              <Button type="submit" variant="outline">
                Send verification email
              </Button>
            </form>
            <PaymentSettings accounts={accounts} error={q.error} />
          </section>
          <section className="panel">
            <h2 id="staff-access">Team & access</h2>
            <p>
              Only owners can change staff access. The last active owner cannot
              be removed or demoted.
            </p>
            <StaffSettings
              members={staffMembers}
              error={q.error}
              activeUserId={q.staff}
            />
          </section>
        </div>
      </main>
    </>
  );
}
