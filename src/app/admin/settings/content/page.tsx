import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { AdminNav } from "@/app/admin/admin-nav";
import { Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveStoreContentAction } from "@/app/admin/settings/content/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
export default async function Content({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login")),
    query = await searchParams;
  const store = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const [store] = await tx.select().from(storeSettings).limit(1);
    return store;
  });
  return (
    <main className="admin">
      <AdminNav />
      <h1>Store information & policies</h1>
      <p>
        Write plain text for customers. Blank pages remain hidden. Translations
        fall back to the default store language.
      </p>
      <Notice error={query.error} />
      {query.saved && (
        <Alert>
          <AlertDescription>Store content saved.</AlertDescription>
        </Alert>
      )}
      <section className="panel">
        <form action={saveStoreContentAction}>
          <Hidden name="revision" value={String(store?.quoteVersion ?? 1)} />
          {(["en", "zh"] as const).map((locale) => (
            <fieldset key={locale}>
              <legend>{locale === "en" ? "English" : "中文"}</legend>
              {(["about", "shipping", "returns", "privacy"] as const).map(
                (key) => (
                  <label key={key} className="mb-5 grid gap-2">
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                    <Textarea
                      name={`${locale}.${key}`}
                      rows={7}
                      maxLength={10000}
                      defaultValue={store?.publicContent[locale]?.[key] ?? ""}
                    />
                  </label>
                ),
              )}
            </fieldset>
          ))}
          <Button type="submit">Save store content</Button>
        </form>
      </section>
      <Link href="/admin/setup">Store settings</Link>
    </main>
  );
}
