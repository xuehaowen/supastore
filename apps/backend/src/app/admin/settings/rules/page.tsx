import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import {
  pickupLocation,
  products,
  productVariants,
  storeSettings,
} from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { commerceRules } from "@/domain/commerce-evaluation";
import { AdminNav } from "@/app/admin/admin-nav";
import { Notice } from "@/app/components";
import { RuleForm } from "./rule-form";
import { previewCommerce } from "@/application/use-cases/commerce/preview-commerce";
import { describeFailure } from "@/infrastructure/http/failure";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { NativeSelect } from "@supastore/ui/native-select";
export default async function CommerceRulesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await db.transaction(async (tx) =>
    verifyStaffInTransaction(tx, await staffIdentity(), "owner"),
  );
  const query = await searchParams;
  const [store] = await db.select().from(storeSettings).limit(1);
  if (!store) return <main>Complete store setup first.</main>;
  const rules = commerceRules(store.commerceRules);
  const targets = [...new Set(rules.flatMap((rule) => rule.variantIds))];
  const load = () =>
    db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        title: products.title,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId));
  const options = await load()
    .orderBy(products.title, productVariants.id)
    .limit(50);
  const selected = targets.length
    ? await load().where(inArray(productVariants.id, targets))
    : [];
  const variants = [
    ...new Map(
      [...options, ...selected].map((variant) => [
        variant.id,
        { id: variant.id, label: `${variant.title} · ${variant.sku}` },
      ]),
    ).values(),
  ];
  const locations = await db
    .select({ id: pickupLocation.id, name: pickupLocation.name })
    .from(pickupLocation);
  let preview: Awaited<ReturnType<typeof previewCommerce>> | undefined,
    error: string | undefined;
  if (query.variant)
    try {
      preview = await previewCommerce({
        items: [
          { variantId: query.variant, quantity: Number(query.quantity ?? 1) },
        ],
        context: {
          ...(query.method
            ? {
                fulfillmentType: query.method as
                  "shipping" | "pickup" | "local_delivery",
              }
            : {}),
          ...(query.country ? { country: query.country } : {}),
          ...(query.region ? { region: query.region } : {}),
          ...(query.pickup ? { pickupLocationId: query.pickup } : {}),
        },
      });
    } catch (failure) {
      error = describeFailure(failure, "admin.commerce.preview").message;
    }
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <h1>Commerce rules</h1>
        <p>
          Configure optional prices, availability, reward rates, free-shipping
          minimums and promotion eligibility by shopping context. No rules
          preserves base product pricing and store reward settings.
        </p>
        {query.saved && <p role="status">Rule saved.</p>}
        <section className="panel">
          <h2>Add rule</h2>
          <RuleForm
            id={randomUUID()}
            version={store.quoteVersion}
            variants={variants}
            locations={locations}
          />
        </section>
        <section className="panel">
          <h2>Saved rules ({rules.length}/100)</h2>
          {rules.map((rule) => (
            <details key={rule.id} className="border-b py-3">
              <summary>{rule.name}</summary>
              <p>
                {rule.kind} · priority {rule.priority} ·{" "}
                {rule.enabled ? "Enabled" : "Disabled"}
              </p>
              <RuleForm
                id={rule.id}
                rule={rule}
                version={store.quoteVersion}
                variants={variants}
                locations={locations}
              />
            </details>
          ))}
        </section>
        <section className="panel">
          <h2>Preview saved rules</h2>
          <p>
            Read-only estimate. Stock, credit and promotion usage are not
            reserved.
          </p>
          <Notice error={error} />
          <form method="get" className="grid gap-3">
            <label>
              Preview variant
              <NativeSelect
                name="variant"
                defaultValue={query.variant ?? ""}
                required
              >
                <option value="">Choose variant</option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label>
              Quantity
              <Input
                name="quantity"
                type="number"
                min={1}
                max={999}
                defaultValue={query.quantity ?? "1"}
              />
            </label>
            <label>
              Preview fulfillment
              <NativeSelect
                name="method"
                defaultValue={query.method ?? "shipping"}
              >
                <option value="shipping">Shipping</option>
                <option value="pickup">Pickup</option>
                <option value="local_delivery">Local delivery</option>
              </NativeSelect>
            </label>
            <label>
              Country code
              <Input
                name="country"
                defaultValue={query.country ?? ""}
                maxLength={2}
              />
            </label>
            <label>
              Region code
              <Input
                name="region"
                defaultValue={query.region ?? ""}
                maxLength={12}
              />
            </label>
            <label>
              Preview pickup location
              <NativeSelect name="pickup" defaultValue={query.pickup ?? ""}>
                <option value="">Choose location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button type="submit">Preview rules</Button>
          </form>
          {preview && (
            <div role="status" className="mt-4">
              <p>
                Merchandise subtotal:{" "}
                {preview.evaluation.merchandiseSubtotalCents ?? "Needs context"}{" "}
                minor units.
              </p>
              <p>
                Reward rate:{" "}
                {preview.evaluation.reward.rateBasisPoints ?? "Needs context"}{" "}
                basis points.
              </p>
              <p>
                Matched:{" "}
                {preview.evaluation.matchedRuleIds
                  .map((id) => rules.find((rule) => rule.id === id)?.name)
                  .join(", ") || "Base settings"}
              </p>
              {preview.evaluation.items.map((item) => (
                <p key={item.variantId}>
                  {item.available ? "Available (not reserved)" : item.reason}
                </p>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
