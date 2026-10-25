import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { attributes } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { AdminNav } from "@/app/admin/admin-nav";
import { CatalogTabs } from "@/app/admin/catalog-tabs";
import { AdminDialog } from "@/app/admin/admin-dialog";
import { Field, Notice } from "@/app/components";
import { NativeSelect } from "@supastore/ui/native-select";
import { Button } from "@supastore/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import { saveAttributeAction } from "@/app/admin/catalog-actions";

export default async function AttributesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; error?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const query = await searchParams;
  const search = (query.q || "").slice(0, 120);
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    return tx
      .select({
        attribute: attributes,
        count: sql<number>`(select count(*)::int from attribute_values where attribute_id = ${sql`${attributes.id}`})`,
      })
      .from(attributes)
      .where(
        sql`(${attributes.name} ilike ${pattern} or ${attributes.code} ilike ${pattern})`,
      )
      .orderBy(asc(attributes.code))
      .limit(26)
      .offset((page - 1) * 25);
  });
  const href = (p: number) =>
    `/admin/attributes?${new URLSearchParams({ q: search, page: String(p) })}`;
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>Attributes & variant options</h1>
        <CatalogTabs />
        <p className="admin-description">
          Descriptive attributes record weight, calories, sugar-free status, and
          other product facts. Variant options such as color and size define
          separately purchasable combinations. Choose the purpose when creating
          a field.
        </p>
        <Notice error={query.error} />
        <form method="get" className="filter-bar">
          <Field
            name="q"
            label="Search attributes"
            value={search}
            required={false}
          />
          <Button type="submit">Search</Button>
        </form>
        <AdminDialog trigger="Add attribute" title="Add attribute">
          <form action={saveAttributeAction}>
            <Field name="label" label="Name" />
            <label>
              Purpose
              <NativeSelect name="kind" defaultValue="descriptive">
                <option value="descriptive">Descriptive attribute</option>
                <option value="variant">Variant option</option>
              </NativeSelect>
            </label>
            <Field name="code" label="Permanent code" />
            <Button type="submit">Create attribute</Button>
          </form>
        </AdminDialog>
        <section className="panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Attribute</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Values</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 25).map(({ attribute: a, count }) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell>
                    {a.kind === "variant"
                      ? "Variant option"
                      : "Descriptive attribute"}
                  </TableCell>
                  <TableCell>{a.code}</TableCell>
                  <TableCell>{count}</TableCell>
                  <TableCell>{a.isArchived ? "Archived" : "Active"}</TableCell>
                  <TableCell>
                    <Link href={`/admin/attributes/${a.id}`}>
                      Manage attribute
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow>
                  <TableCell colSpan={6}>
                    No attributes match this search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
        <nav className="pager" aria-label="Attribute pages">
          {page > 1 && <Link href={href(page - 1)}>Previous</Link>}
          <span>Page {page}</span>
          {rows.length > 25 && <Link href={href(page + 1)}>Next</Link>}
        </nav>
      </main>
    </>
  );
}
