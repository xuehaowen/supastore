import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings, paymentAccounts } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import {
  sendVerification,
  setupOwner,
  saveSettings,
  saveShipping,
  savePickup,
  savePayment,
} from "@/app/actions";
import { Field, Hidden, Notice, AdminNav } from "@/app/components";
export default async function Setup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const [store] = await db.select().from(storeSettings).limit(1);
  const q = await searchParams;
  if (!store?.isBootstrapCompleted)
    return (
      <main className="narrow standalone">
        <h1>Create your store</h1>
        <Notice error={q.error} />
        <form action={setupOwner}>
          <Field label="Store name" name="storeName" />
          <Field label="One-time setup secret" name="secret" type="password" />
          <button>Create store</button>
        </form>
      </main>
    );
  await db
    .transaction((tx) => verifyStaffInTransaction(tx, staff, "owner"))
    .catch(() => redirect("/admin/login"));
  const accounts = await db.select().from(paymentAccounts);
  return (
    <main className="admin">
      <AdminNav />
      <p className="eyebrow">MAKE IT YOURS</p>
      <h1>Store setup</h1>
      <Notice error={q.error} />
      <div className="admin-grid">
        <section className="panel">
          <h2>01 / Store profile</h2>
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
              <Field label="Currency" name="currency" value={store.currency} />
              <Field
                label="Decimal places"
                name="precision"
                type="number"
                value={store.precision}
              />
            </div>
            <label>
              Default language
              <select name="defaultLocale" defaultValue={store.defaultLocale}>
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </label>
            <Field label="Timezone" name="timezone" value={store.timezone} />
            <Field
              label="Tax rate (basis points)"
              name="taxRate"
              type="number"
              value={store.taxRateBasisPoints}
            />
            <label className="check">
              <input
                type="checkbox"
                name="taxInclusive"
                defaultChecked={store.isTaxInclusive}
              />
              Prices include tax
            </label>
            <button>Save profile</button>
          </form>
        </section>
        <section className="panel">
          <h2>02 / Shipping</h2>
          <form action={saveShipping}>
            <Field label="Zone name" name="zoneName" value="Standard" />
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
            <button>Save shipping zone</button>
          </form>
          <h2>Local pickup</h2>
          <form action={savePickup}>
            <Field label="Location name" name="name" />
            <Field label="Pickup address" name="address" />
            <Field
              label="Preparation notice (minutes)"
              name="prepMinutes"
              type="number"
              value="60"
            />
            <fieldset>
              <legend>Pickup days</legend>
              {["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => (
                <label className="check" key={day}>
                  <input
                    type="checkbox"
                    name="days"
                    value={day}
                    defaultChecked={!["sat", "sun"].includes(day)}
                  />
                  {day}
                </label>
              ))}
            </fieldset>
            <Field
              label="Start time"
              name="startTime"
              type="time"
              value="09:00"
            />
            <Field label="End time" name="endTime" type="time" value="17:00" />
            <button>Save pickup</button>
          </form>
        </section>
        <section className="panel">
          <h2>03 / Email & payment methods</h2>
          <p>
            {store.emailVerifiedAt
              ? "Email delivery verified"
              : "Verify that store email reaches your inbox."}
          </p>
          <form action={sendVerification}>
            <button className="secondary">Send verification email</button>
          </form>
          {accounts.map((a) => (
            <div key={a.id}>
              <h3>{a.accountName}</h3>
              <p>{a.accountIdentifier}</p>
              <form action={savePayment}>
                <Hidden name="id" value={a.id} />
                <Hidden name="active" value={String(!a.isActive)} />
                <button className="secondary">
                  {a.isActive ? "Disable" : "Enable"}
                </button>
              </form>
            </div>
          ))}
          <form action={savePayment}>
            <Field label="Method name" name="name" />
            <label>
              Receiving account and instructions
              <textarea name="instructions" required />
            </label>
            <button>Add payment method</button>
          </form>
        </section>
      </div>
    </main>
  );
}
