import { ProductEditorNav } from "@/app/admin/product-editor-nav";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  products,
  productVariants,
  attributes,
  attributeValues,
  productOptions,
  productOptionValues,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { loadGenerationOptions } from "@/application/use-cases/catalog/generate-variants";
import {
  buildVariantCombinations,
  type GeneratedCombination,
} from "@/domain/catalog/variant-combinations";
import { AdminNav } from "@/app/admin/admin-nav";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import { NativeSelect } from "@supastore/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";
import { Alert, AlertDescription } from "@supastore/ui/alert";
import { generateVariantsAction } from "@/app/admin/catalog-actions";

export default async function ProductOptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    values?: string | string[];
    prefix?: string;
    priceCents?: string;
    preview?: string;
    error?: string;
    generated?: string;
    q?: string;
  }>;
}) {
  const staff = await staffIdentity().catch(() => redirect("/admin/login"));
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const query = await searchParams;
  const requested = query.values
    ? Array.isArray(query.values)
      ? query.values
      : [query.values]
    : [];
  const search = (query.q || "").slice(0, 120);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const data = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, staff, "owner");
    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, id));
    if (!product) return null;
    const variants = await tx
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.sortOrder));
    const choices = await tx
      .select({ attribute: attributes, value: attributeValues })
      .from(attributeValues)
      .innerJoin(attributes, eq(attributes.id, attributeValues.attributeId))
      .where(
        and(
          eq(attributes.isArchived, false),
          eq(attributes.kind, "variant"),
          eq(attributeValues.isArchived, false),
          sql`(${attributes.name} ilike ${pattern} or ${attributes.code} ilike ${pattern})`,
        ),
      )
      .orderBy(
        asc(attributes.code),
        asc(attributeValues.sortOrder),
        asc(attributeValues.code),
      )
      .limit(201);
    const configured = await tx
      .select({ valueId: productOptionValues.attributeValueId })
      .from(productOptionValues)
      .innerJoin(
        productOptions,
        eq(productOptions.id, productOptionValues.optionId),
      )
      .where(eq(productOptions.productId, id));
    let combinations: GeneratedCombination[] = [],
      error: string | undefined;
    const valueIds = query.preview
      ? requested
      : configured.map((v) => v.valueId);
    const prefix = (
      query.prefix ??
      product.skuPrefix ??
      product.handle.toUpperCase()
    ).slice(0, 81);
    if (query.preview)
      try {
        combinations = buildVariantCombinations(
          await loadGenerationOptions(tx, valueIds),
          prefix,
        );
      } catch (e) {
        error = (e as Error).message;
      }
    return {
      product,
      variants,
      choices: choices.slice(0, 200),
      truncated: choices.length > 200,
      combinations,
      error,
      valueIds,
      prefix,
    };
  });
  if (!data) notFound();
  const { product, variants, choices, combinations, valueIds, prefix } = data;
  const price = query.priceCents || "0";
  const legacy = variants.filter((v) => !v.combinationKey);
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <Link href={`/admin/products/${id}/edit`}>← Edit product</Link>
        <h1>Options & variants</h1>
        <ProductEditorNav productId={id} />
        <p className="admin-description">
          {product.title} · Choose values, preview combinations, then select the
          variants to create. Existing variants retain their IDs, titles, SKUs,
          prices, and availability.
        </p>
        <Notice error={query.error || data.error} />
        {query.generated !== undefined && (
          <Alert>
            <AlertDescription>
              {query.generated} variants created. Existing variants preserved.
            </AlertDescription>
          </Alert>
        )}
        <section className="panel">
          <h2>Product options</h2>
          <Link href="/admin/attributes">Manage reusable variant options</Link>
          <form method="get">
            <Hidden name="preview" value="1" />
            <Field
              name="q"
              label="Find a variant option"
              value={search}
              required={false}
            />
            <Field name="prefix" label="SKU prefix" value={prefix} />
            <Field
              name="priceCents"
              label="Default price in minor units"
              type="number"
              value={price}
            />
            <p>
              Choose up to four variant options. Generation is limited to 50
              combinations.
            </p>
            {choices.map(({ attribute: a, value: v }) => (
              <label className="check" key={v.id}>
                <Checkbox
                  name="values"
                  value={v.id}
                  defaultChecked={valueIds.includes(v.id)}
                />
                {a.name}: {v.label} ({a.code} / {v.code})
              </label>
            ))}
            {!choices.length && (
              <p>
                No active values match. Add variant options and values first.
              </p>
            )}
            {data.truncated && (
              <p>Showing 200 values. Refine the variant option search.</p>
            )}
            {valueIds
              .filter((valueId) => !choices.some((c) => c.value.id === valueId))
              .map((valueId) => (
                <Hidden key={valueId} name="values" value={valueId} />
              ))}
            <Button type="submit">Preview combinations</Button>
          </form>
        </section>
        {combinations.length > 0 && (
          <section className="panel">
            <h2>Review {combinations.length} combinations</h2>
            <form action={generateVariantsAction}>
              <Hidden name="productId" value={id} />
              <Hidden
                name="quoteVersion"
                value={String(product.quoteVersion)}
              />
              <Hidden name="prefix" value={prefix} />
              <Hidden name="priceCents" value={price} />
              {valueIds.map((valueId) => (
                <Hidden key={valueId} name="values" value={valueId} />
              ))}
              {legacy.length > 0 && (
                <fieldset>
                  <legend>Map existing variants explicitly</legend>
                  <p>
                    Match each existing variant to its exact option values.
                    Labels and translations are never guessed. Each combination
                    can belong to only one variant.
                  </p>
                  {legacy.map((v) => (
                    <label key={v.id}>
                      <Hidden name="legacyIds" value={v.id} />
                      {v.title} · {v.sku}
                      <NativeSelect
                        name={`mapping.${v.id}`}
                        aria-label={`Map ${v.sku}`}
                        required
                        defaultValue=""
                      >
                        <option value="">Choose exact combination</option>
                        {combinations.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.title}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                  ))}
                </fieldset>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Create</TableHead>
                    <TableHead>Combination</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {combinations.map((c) => {
                    const current = variants.find(
                      (v) => v.combinationKey === c.key,
                    );
                    return (
                      <TableRow key={c.key}>
                        <TableCell>
                          {current ? (
                            "Retained"
                          ) : (
                            <Checkbox
                              name="keys"
                              value={c.key}
                              defaultChecked
                              aria-label={`Create ${c.title}`}
                            />
                          )}
                        </TableCell>
                        <TableCell>{c.title}</TableCell>
                        <TableCell>{current?.sku || c.sku}</TableCell>
                        <TableCell>
                          {current ? "Existing" : "New (or explicitly mapped)"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Button type="submit">Save options & generate variants</Button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}
