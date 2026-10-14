import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field, Notice } from "@/app/components";
import { Textarea } from "@supastore/ui/textarea";
import { Button } from "@supastore/ui/button";
import { createDraftProductAction } from "@/app/admin/catalog-actions";
export default async function NewProduct({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  await db.transaction((tx) => verifyStaffInTransaction(tx, staff, "owner"));
  const query = await searchParams;
  return (
    <main className="admin">
      <AdminNav />
      <Link href="/admin/products">← All products</Link>
      <h1>Create product</h1>
      <p className="admin-description">
        Start with a draft. Add options, variants, images, categories, and
        collections before publishing.
      </p>
      <Notice error={query.error} />
      <section className="panel">
        <form action={createDraftProductAction}>
          <Field name="title" label="Product title" />
          <Field name="handle" label="URL handle" />
          <label>
            Description
            <Textarea name="description" />
          </label>
          <Button type="submit">Create draft</Button>
        </form>
      </section>
    </main>
  );
}
