import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { staffIdentity } from "@/infrastructure/web";
import { apiResponse, readApiBody } from "@/infrastructure/http/commerce-api";
import { updateStoreSettings } from "@/application/use-cases/store/update-store-settings";
import { commercePolicy } from "@/domain/commerce-policy";
import { DomainError } from "@/application/common/errors";
const keys = [
  "storeName",
  "logoKey",
  "storefrontHero",
  "supportEmail",
  "currency",
  "precision",
  "defaultLocale",
  "timezone",
  "isOrderingEnabled",
  "isPaused",
  "pauseMessage",
  "taxRateBasisPoints",
  "isTaxInclusive",
  "setupCompleted",
  "commercePolicy",
] as const;
export async function GET() {
  return apiResponse(async () =>
    db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, await staffIdentity(), "owner");
      const [store] = await tx.select().from(storeSettings).limit(1);
      return store
        ? Object.fromEntries(keys.map((key) => [key, store[key]]))
        : null;
    }),
  );
}
export async function POST(request: Request) {
  return apiResponse(async () => {
    const b = await readApiBody(request);
    for (const key of Object.keys(b))
      if (!(keys as readonly string[]).includes(key))
        throw new DomainError(`Unsupported setting: ${key}.`);
    const policy =
      b.commercePolicy === undefined
        ? {}
        : { commercePolicy: commercePolicy(b.commercePolicy) };
    // The authoritative use case validates every other field and verifies the owner inside its transaction.
    const updated = await updateStoreSettings({
      ...b,
      ...policy,
      staffUserId: await staffIdentity(),
    });
    return Object.fromEntries(keys.map((key) => [key, updated[key]]));
  });
}
