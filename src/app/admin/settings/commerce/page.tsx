import { CategoryPicker } from "@/app/admin/category-picker";
import { db } from "@/infrastructure/db";
import { storeSettings, categories } from "@/infrastructure/db/schema";
import { asc, inArray } from "drizzle-orm";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { commercePolicy } from "@/domain/commerce-policy";
import { saveCommercePolicy } from "./actions";
import { Field, Notice } from "@/app/components";
import { AdminNav } from "@/app/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
export default async function CommerceSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await db.transaction((tx) =>
    staffIdentity().then((id) => verifyStaffInTransaction(tx, id, "owner")),
  );
  const [store] = await db.select().from(storeSettings).limit(1);
  const policy = commercePolicy(store?.commercePolicy);
  const rewardCategories = await db
    .select()
    .from(categories)
    .orderBy(asc(categories.name), asc(categories.id))
    .limit(50);
  const selectedCategories = policy.rewardEligibleCategoryIds.length
    ? await db
        .select({ id: categories.id, label: categories.name })
        .from(categories)
        .where(inArray(categories.id, policy.rewardEligibleCategoryIds))
    : [];
  const query = await searchParams;
  return (
    <main className="admin">
      <AdminNav />
      <h1>Commerce policies</h1>
      <Notice error={query.error} />
      {query.saved && (
        <Alert>
          <AlertDescription>Settings saved.</AlertDescription>
        </Alert>
      )}
      <form action={saveCommercePolicy} className="panel">
        {(
          [
            ["guestCheckout", "Allow guest checkout"],
            ["shippingEnabled", "Enable shipping"],
            ["pickupEnabled", "Enable pickup"],
            ["deliveryEnabled", "Enable local delivery"],
            ["rewardsEnabled", "Enable purchase rewards"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="flex items-center gap-2">
            <Checkbox name={name} defaultChecked={policy[name]} />
            {label}
          </label>
        ))}
        <Field
          label="Reward rate in basis points (500 = 5%)"
          name="rewardRateBasisPoints"
          type="number"
          value={String(policy.rewardRateBasisPoints)}
        />
        <p>
          Rewards apply to externally funded eligible merchandise and become
          available after delivery or pickup handoff. Accepted orders retain
          their policy.
        </p>
        <fieldset>
          <legend>Eligible reward categories</legend>
          <p>
            Leave all unchecked to include every category. Product reward
            exclusions always apply.
          </p>
          <CategoryPicker
            name="rewardEligibleCategoryIds"
            label="Category selection"
            options={rewardCategories.map((item) => ({
              id: item.id,
              label: item.name,
            }))}
            selected={selectedCategories}
          />
        </fieldset>
        <Field
          label="Reward start (UTC, e.g. 2026-10-01T00:00:00Z; optional)"
          name="rewardsStartAt"
          value={policy.rewardsStartAt ?? ""}
          required={false}
        />
        <Field
          label="Reward end, exclusive (UTC; optional)"
          name="rewardsEndAt"
          value={policy.rewardsEndAt ?? ""}
          required={false}
        />
        <p>
          Orders accepted at the start earn rewards; orders at or after the end
          do not. Existing orders keep their accepted rate and eligibility.
        </p>
        <Field
          label="Optional sales warning threshold in minor units"
          name="salesThresholdCents"
          type="number"
          value={
            policy.salesThresholdCents === null
              ? ""
              : String(policy.salesThresholdCents)
          }
          required={false}
        />
        <Field
          label="Fiscal year start month (1–12)"
          name="fiscalYearStartMonth"
          type="number"
          value={String(policy.fiscalYearStartMonth)}
        />
        <Button type="submit">Save policies</Button>
      </form>
    </main>
  );
}
