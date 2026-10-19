import Link from "next/link";
import { redirect } from "next/navigation";
import {
  smsReadiness,
  smsDisclosure,
  smsKeywordMessages,
} from "@supastore/contracts";
import { db } from "@/infrastructure/db";
import { storeSettings, smsConsentEvents } from "@/infrastructure/db/schema";
import { desc } from "drizzle-orm";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { liveSmsAuthorized } from "@/infrastructure/bootstrap/notification-providers";
import { AdminNav } from "@/app/admin/admin-nav";
import { Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { saveSmsSettingsAction } from "./actions";
export default async function SmsSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const { store, consentEvents } = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return {
      store: (await tx.select().from(storeSettings).limit(1))[0],
      consentEvents: await tx
        .select()
        .from(smsConsentEvents)
        .orderBy(desc(smsConsentEvents.createdAt), desc(smsConsentEvents.id))
        .limit(50),
    };
  });
  if (!store) redirect("/admin/setup");
  const readiness = smsReadiness(store);
  const locale = store.defaultLocale === "zh" ? "zh" : "en";
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>SMS order updates</h1>
        <Notice error={query.error} />
        {query.saved && <p role="status">SMS settings saved.</p>}
        <section className="panel">
          <h2>Setup readiness</h2>
          <p>
            {readiness.ready
              ? "Merchant settings are complete."
              : "Complete the following before enabling SMS opt-in."}
          </p>
          <ul>
            {readiness.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p>
            {liveSmsAuthorized()
              ? "Live messaging authorization is enabled; provider configuration is also required."
              : "Live SMS and phone verification remain disabled by the application authorization gate. Forms show this availability to customers."}
          </p>
          <Link href="/admin/settings/content">Edit policy pages</Link>
          <form action={saveSmsSettingsAction} className="grid gap-4 mt-4">
            <Hidden name="revision" value={String(store.quoteVersion)} />
            <label>
              <input
                type="checkbox"
                name="reviewed"
                defaultChecked={store.smsPolicy.reviewed}
              />{" "}
              I reviewed the published policies, consent language, support
              contact and actual messaging practices for this business.
            </label>
            <label>
              <input
                type="checkbox"
                name="enabled"
                defaultChecked={store.smsPolicy.enabled}
              />{" "}
              Enable SMS order-update opt-in
            </label>
            <Button type="submit">Save SMS settings</Button>
          </form>
        </section>
        <section className="panel">
          <h2>Consent and campaign submission</h2>
          <p>{smsDisclosure(store)}</p>
          <p>
            Use the public storefront URL <code>/{locale}/sms</code> in the
            campaign message flow. Checkout also offers the same opt-in. Capture
            a screenshot showing the phone field, unchecked checkbox, full
            disclosures and policy links after deployment.
          </p>
          <p>
            Customers affirm consent, then verify their phone by code.
            Purchasing does not require SMS consent. Verified subscriptions can
            be attached to an order at checkout. Only order updates are
            supported.
          </p>
          <p>
            Publish <code>/{locale}/pages/privacy</code> and{" "}
            <code>/{locale}/pages/terms</code> on the merchant’s domain. Confirm
            all URLs work on that domain before submission.
          </p>
          <h3>Keyword responses</h3>
          <p>
            Configure these responses in your messaging provider’s
            campaign/profile. This page generates the text; it does not update
            Telnyx automatically.
          </p>
          {Object.entries(smsKeywordMessages(store)).map(
            ([keyword, message]) => (
              <div key={keyword}>
                <h4>{keyword}</h4>
                <p className="whitespace-pre-wrap">{message}</p>
              </div>
            ),
          )}
        </section>
        <section className="panel">
          <h2>Recent consent history</h2>
          {!consentEvents.length && <p>No SMS consent events recorded.</p>}
          {consentEvents.map((event) => (
            <details key={event.id} className="py-3 border-b">
              <summary>
                {event.createdAt.toISOString()} · {event.phone} · {event.action}
              </summary>
              <p>
                Source: {event.source} · Version: {event.version}
              </p>
              <p>{event.wording}</p>
            </details>
          ))}
        </section>
        <Link href="/admin/setup">Store settings</Link>
      </main>
    </>
  );
}
