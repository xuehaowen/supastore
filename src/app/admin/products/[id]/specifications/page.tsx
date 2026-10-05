import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  attributes,
  attributeValues,
} from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { listSpecifications } from "@/application/use-cases/catalog/manage-specifications";
import { changeSpecificationAction } from "@/app/admin/catalog-actions";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

export default async function Specifications({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; error?: string; saved?: string }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params,
    query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff);
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, id));
    if (!product) return null;
    const search = `%${(query.q || "").slice(0, 100).replace(/[\\%_]/g, "\\$&")}%`;
    const candidates = await tx
      .select({
        id: attributeValues.id,
        name: attributes.name,
        label: attributeValues.label,
      })
      .from(attributeValues)
      .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
      .where(
        and(
          eq(attributes.isArchived, false),
          eq(attributeValues.isArchived, false),
          sql`(${attributes.name} ilike ${search} or ${attributeValues.label} ilike ${search})`,
        ),
      )
      .orderBy(asc(attributes.code), asc(attributeValues.code))
      .limit(25);
    return { product, candidates };
  });
  if (!data) notFound();
  const specs = await listSpecifications(id, "en", "en");
  const identity = (
    <>
      <Hidden name="productId" value={id} />
      <Hidden name="revision" value={String(data.product.quoteVersion)} />
    </>
  );
  return (
    <main className="admin">
      <AdminNav />
      <Link href={`/admin/products/${id}/edit`}>← Product editor</Link>
      <h1>Specifications · {data.product.title}</h1>
      <p>
        Describe material, care, origin, or other properties. Specifications do
        not generate variants.
      </p>
      <Notice error={query.error} />
      {query.saved && <p role="status">Specifications saved.</p>}
      <section className="panel">
        <table>
          <thead>
            <tr>
              <th>Attribute</th>
              <th>Value</th>
              <th>Position</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {specs.map((s) => (
              <tr key={s.valueId}>
                <td>{s.name}</td>
                <td>{s.label}</td>
                <td>{s.sortOrder}</td>
                <td>
                  <form action={changeSpecificationAction}>
                    {identity}
                    <Hidden name="valueId" value={s.valueId} />
                    <Field
                      name="sortOrder"
                      label={`Position · ${s.label}`}
                      type="number"
                      value={s.sortOrder}
                    />
                    <Button type="submit">Save position</Button>
                    <Button
                      name="remove"
                      value="true"
                      type="submit"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!specs.length && <p>No specifications yet.</p>}
      </section>
      <section className="panel">
        <h2>Add specification</h2>
        <form method="get">
          <Field
            name="q"
            label="Find attribute or value"
            value={query.q || ""}
            required={false}
          />
          <Button type="submit">Search values</Button>
        </form>
        <form action={changeSpecificationAction}>
          {identity}
          <label>
            Attribute value
            <NativeSelect name="valueId" required>
              <option value="">Choose a value</option>
              {data.candidates.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <Hidden name="sortOrder" value={String(specs.length)} />
          <Button type="submit">Add specification</Button>
        </form>
        <Link href="/admin/attributes">Manage reusable attributes</Link>
      </section>
    </main>
  );
}
