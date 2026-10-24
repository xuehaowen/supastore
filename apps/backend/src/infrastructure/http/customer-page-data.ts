import { accountView, cartView, orderView } from "./customer-page-view";
import { localizeCategories } from "@/application/use-cases/catalog/localize";
import { categoryNavigation } from "@/domain/catalog/category-navigation";
import { listProducts } from "@/application/use-cases/catalog/list-products";
import { db } from "@/infrastructure/db";
import {
  storeSettings,
  categories,
  productCollections,
  collectionTranslations,
  attributes,
  attributeValues,
  variantStock,
  carts,
  deliveryAreas,
  paymentAccounts,
  pickupLocation,
  quotes,
  shippingZones,
  stripeCheckoutAttempts,
} from "@/infrastructure/db/schema";
import { and, eq, inArray, sql, ne } from "drizzle-orm";
import {
  guestIdentity,
  customerIdentity,
  orderToken,
} from "@/infrastructure/web";
import { auth } from "@/infrastructure/auth";
import { headers } from "next/headers";
import { getProduct } from "@/application/use-cases/catalog/get-product";
import { NotFoundError } from "@/application/common/errors";
import { listSpecifications } from "@/application/use-cases/catalog/manage-specifications";
import { getCart } from "@/application/use-cases/cart/get-cart";
import { customerAccount } from "@/application/use-cases/customers/customer-ownership";
import { type QuoteTerms } from "@/application/use-cases/get-quote";
import { stripeConfiguredFor } from "@/infrastructure/payments/configuration";
import { trackOrder } from "@/application/use-cases/tracking";
import { availableFulfillment } from "@supastore/shipping/destination";
import { commercePolicy } from "@/domain/commerce-policy";
import { pickupAvailability } from "@/domain/pickup-availability";
import { parseActionUuid } from "@/application/common/request-validation";
import type { CustomerPageModels } from "@supastore/contracts";
import { smsReadiness } from "@supastore/contracts";
import { smsEnrollmentAvailable } from "@/infrastructure/bootstrap/notification-providers";

type Serialized<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: Serialized<T[K]> }
    : T;
type MatchesPublicContracts<T extends CustomerPageModels> = T;
/** Fail compilation when a backend response no longer implements its HTTP contract. */
export type CustomerPageContractCheck = MatchesPublicContracts<{
  collections: Serialized<Awaited<ReturnType<typeof collectionsPage>>>;
  layout: Serialized<Awaited<ReturnType<typeof layoutPage>>>;
  catalog: Serialized<Awaited<ReturnType<typeof catalogPage>>>;
  product: Serialized<Awaited<ReturnType<typeof productPage>>>;
  cart: Serialized<Awaited<ReturnType<typeof cartPage>>>;
  checkout: Serialized<Awaited<ReturnType<typeof checkoutPage>>>;
  account: Serialized<Awaited<ReturnType<typeof accountPage>>>;
  order: Serialized<Awaited<ReturnType<typeof orderPage>>>;
  collection: Serialized<Awaited<ReturnType<typeof collectionPage>>>;
}>;
export type PageQuery = {
  home?: string;
  q?: string;
  category?: string;
  page?: string;
  sort?: string;
  options?: string | string[];
  quote?: string;
  edit?: string;
  reference?: string;
  creditPage?: string;
};
async function publicStore() {
  const [store] = await db
    .select({
      storeName: storeSettings.storeName,
      smsPolicy: storeSettings.smsPolicy,
      logoKey: storeSettings.logoKey,
      storefrontHero: storeSettings.storefrontHero,
      supportEmail: storeSettings.supportEmail,
      publicContent: storeSettings.publicContent,
      currency: storeSettings.currency,
      precision: storeSettings.precision,
      defaultLocale: storeSettings.defaultLocale,
      timezone: storeSettings.timezone,
      isPaused: storeSettings.isPaused,
      pauseMessage: storeSettings.pauseMessage,
      isOrderingEnabled: storeSettings.isOrderingEnabled,
      commercePolicy: storeSettings.commercePolicy,
      hasContextualRules: sql<boolean>`exists (select 1 from jsonb_array_elements(${storeSettings.commerceRules}) r where coalesce(r->>'enabled', 'true') = 'true')`,
    })
    .from(storeSettings)
    .limit(1);
  return store
    ? {
        ...store,
        sms: {
          enabled: smsReadiness(store).enabled,
          available: smsReadiness(store).enabled && smsEnrollmentAvailable(),
        },
        commercePolicy: commercePolicy(store.commercePolicy),
      }
    : undefined;
}
async function verifiedSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.emailVerified
    ? {
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          emailVerified: true,
        },
      }
    : null;
}
export async function catalogPage(locale: string, query: PageQuery = {}) {
  const selectedOptions = (
    Array.isArray(query.options) ? query.options : [query.options || ""]
  )
    .filter(Boolean)
    .slice(0, 4);
  const [result, store, facets, collections, categoryRows] = await Promise.all([
    listProducts({
      locale,
      featuredFirst:
        query.home === "1" &&
        !query.q &&
        !query.category &&
        !selectedOptions.length &&
        (!query.sort || query.sort === "newest"),
      search: query.q ?? "",
      categorySlug: query.category ?? "",
      page: Number(query.page) || 1,
      sort: ["newest", "price-low", "price-high"].includes(query.sort || "")
        ? (query.sort as "newest" | "price-low" | "price-high")
        : "newest",
      optionValues: selectedOptions.map((value) => {
        const [attribute, code] = value.split(":");
        return { attribute: attribute || "", value: code || "" };
      }),
    }),
    publicStore(),
    db
      .select({
        attribute: attributes.code,
        name: sql<string>`coalesce((select name from attribute_translations where attribute_id=${attributes.id} and locale=${locale}), ${attributes.name})`,
        value: attributeValues.code,
        label: sql<string>`coalesce((select label from attribute_value_translations where attribute_value_id=${attributeValues.id} and locale=${locale}), ${attributeValues.label})`,
      })
      .from(attributes)
      .innerJoin(
        attributeValues,
        eq(attributeValues.attributeId, attributes.id),
      )
      .where(
        and(
          eq(attributes.isArchived, false),
          eq(attributeValues.isArchived, false),
          sql`exists (select 1 from product_options o join products p on p.id=o.product_id where o.attribute_id=${attributes.id} and p.is_published)`,
        ),
      )
      .orderBy(
        attributes.sortOrder,
        attributes.code,
        attributeValues.sortOrder,
        attributeValues.code,
      )
      .limit(200),
    db
      .select()
      .from(productCollections)
      .where(eq(productCollections.isPublished, true))
      .orderBy(
        sql`case when exists(select 1 from store_settings s, jsonb_array_elements_text(coalesce(s.storefront_hero->'featuredCollectionIds', '[]'::jsonb)) f(id) where f.id=${productCollections.id}::text) then 0 else 1 end`,
        productCollections.sortOrder,
        productCollections.handle,
        productCollections.id,
      )
      .limit(25),
    db.select().from(categories).orderBy(categories.sortOrder, categories.slug),
  ]);
  const [collectionTitles, groups] = await Promise.all([
    collections.length
      ? db
          .select()
          .from(collectionTranslations)
          .where(
            and(
              eq(collectionTranslations.locale, locale),
              inArray(
                collectionTranslations.collectionId,
                collections.map((c) => c.id),
              ),
            ),
          )
      : [],
    localizeCategories(
      categoryNavigation(categoryRows),
      locale,
      store?.defaultLocale ?? "en",
    ),
  ]);

  return { result, store, facets, collections, collectionTitles, groups };
}

export async function collectionsPage(
  locale: string,
  query: { page?: string },
) {
  const pageSize = 24;
  const requested = Number(query.page || "1");
  const [count] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(productCollections)
    .where(eq(productCollections.isPublished, true));
  const total = count?.total ?? 0;
  const page = Math.min(
    Math.max(1, Number.isSafeInteger(requested) ? requested : 1),
    Math.max(1, Math.ceil(total / pageSize)),
  );
  const [collections, store] = await Promise.all([
    db
      .select()
      .from(productCollections)
      .where(eq(productCollections.isPublished, true))
      .orderBy(
        productCollections.sortOrder,
        productCollections.handle,
        productCollections.id,
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    publicStore(),
  ]);
  const collectionTitles = collections.length
    ? await db
        .select()
        .from(collectionTranslations)
        .where(
          and(
            eq(collectionTranslations.locale, locale),
            inArray(
              collectionTranslations.collectionId,
              collections.map((item) => item.id),
            ),
          ),
        )
    : [];
  return { collections, collectionTitles, store, page, pageSize, total };
}
export async function cartPage(locale: string) {
  const identity = await guestIdentity();
  const cart = identity
    ? await getCart({ guestSessionId: identity, locale })
    : null;
  const store = await publicStore();
  return { cart: cartView(cart), store };
}
export async function productPage(locale: string, handle: string) {
  const [p, store] = await Promise.all([
    getProduct({ handle, locale }),
    publicStore(),
  ]);
  const [stock, specs] = await Promise.all([
    p.variants.length
      ? db
          .select()
          .from(variantStock)
          .where(
            inArray(
              variantStock.variantId,
              p.variants.map((v) => v.id),
            ),
          )
      : [],
    listSpecifications(p.id, locale, store?.defaultLocale || "en"),
  ]);
  const availableQuantities = Object.fromEntries(
    stock
      .filter((s) => s.trackingEnabled)
      .map((s) => [s.variantId, Math.max(0, s.onHand - s.reserved)]),
  );
  const purchasable = {
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      isAvailable:
        v.isAvailable &&
        (availableQuantities[v.id] === undefined ||
          availableQuantities[v.id]! > 0),
    })),
  };
  return { purchasable, store, availableQuantities, specs };
}
export async function layoutPage() {
  const [store, session] = await Promise.all([
    publicStore(),
    verifiedSession(),
  ]);
  return { store, session };
}
export async function checkoutPage(locale: string, query: PageQuery = {}) {
  const identity = await guestIdentity();
  const cart = identity
    ? await getCart({ guestSessionId: identity, locale })
    : null;
  const store = await publicStore();
  const shippingRules = await db
    .select({
      countryCodes: shippingZones.countryCodes,
      regionCodes: shippingZones.regionCodes,
      postalPrefixes: shippingZones.postalPrefixes,
    })
    .from(shippingZones);
  const accounts = await db
    .select({ id: paymentAccounts.id, name: paymentAccounts.accountName })
    .from(paymentAccounts)
    .where(
      and(
        eq(paymentAccounts.isActive, true),
        ne(paymentAccounts.accountType, "stripe"),
      ),
    );
  const locations = await db
    .select()
    .from(pickupLocation)
    .orderBy(pickupLocation.name);
  const delivery = await db
    .select()
    .from(deliveryAreas)
    .where(eq(deliveryAreas.isActive, true))
    .orderBy(deliveryAreas.name);
  const methods = availableFulfillment(commercePolicy(store?.commercePolicy), {
    shipping: shippingRules.length,
    pickup: locations.length,
    delivery: delivery.length,
  });
  const [ownedQuote] =
    query.quote && identity
      ? await db
          .select({ quote: quotes })
          .from(quotes)
          .innerJoin(carts, eq(carts.id, quotes.cartId))
          .where(
            and(
              eq(quotes.id, parseActionUuid(query.quote, "Quote")),
              eq(carts.guestSessionId, identity),
            ),
          )
      : [];
  const savedQuote = ownedQuote?.quote;
  const quote = query.edit === "1" ? undefined : savedQuote;
  const initial = savedQuote?.termsSnapshot as QuoteTerms | undefined;
  const customerUserId = await customerIdentity();
  const customer = customerUserId
    ? await customerAccount(customerUserId)
    : null;
  return {
    cart: cartView(cart),
    store,
    shippingRules,
    accounts,
    locations: locations.map((location) => ({
      ...location,
      dates: pickupAvailability(location, store?.timezone ?? "UTC", new Date()),
    })),
    delivery: delivery.map((area) => ({
      ...area,
      dates: area.scheduleRequired
        ? pickupAvailability(
            { ...area, blackoutDates: [] },
            store?.timezone ?? "UTC",
            new Date(),
          )
        : [],
    })),
    methods,
    savedQuote,
    quote,
    initial,
    customer: customer ? accountView(customer) : null,
    onlinePayment: stripeConfiguredFor(store),
  };
}
export async function accountPage(query: PageQuery = {}) {
  const rawSession = await auth.api.getSession({ headers: await headers() });
  const session = rawSession?.user.emailVerified
    ? {
        user: {
          id: rawSession.user.id,
          name: rawSession.user.name,
          email: rawSession.user.email,
        },
      }
    : null;
  const page = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.page || "1", 10) || 1),
  );
  const reference = (query.reference || "").trim().slice(0, 100);
  const creditPage = Math.min(
    10000,
    Math.max(1, Number.parseInt(query.creditPage || "1", 10) || 1),
  );
  const account = session
    ? await customerAccount(session.user.id, page, reference, creditPage)
    : null;
  return {
    session,
    account: account ? accountView(account) : null,
    page,
    reference,
    creditPage,
    hasUnverifiedSession: Boolean(rawSession && !session),
  };
}
export async function orderPage(id: string) {
  parseActionUuid(id, "Order");
  const result = await trackOrder(id, await orderToken(id));
  const store = await publicStore();
  const [paymentAttempt] = await db
    .select({ status: stripeCheckoutAttempts.status })
    .from(stripeCheckoutAttempts)
    .where(eq(stripeCheckoutAttempts.orderId, id))
    .limit(1);

  return {
    result: orderView(result),
    store,
    paymentAttempt,
    onlinePayment: Boolean(store && stripeConfiguredFor(store)),
  };
}
export async function collectionPage(
  locale: string,
  handle: string,
  query: PageQuery = {},
) {
  const [collection] = await db
    .select()
    .from(productCollections)
    .where(
      and(
        eq(productCollections.handle, handle),
        eq(productCollections.isPublished, true),
      ),
    )
    .limit(1);
  if (!collection) throw new NotFoundError("Collection not found.");
  const translations = await db
    .select()
    .from(collectionTranslations)
    .where(eq(collectionTranslations.collectionId, collection.id));
  const store = await publicStore();
  const translated =
    translations.find((item) => item.locale === locale) ??
    translations.find((item) => item.locale === store?.defaultLocale);

  const result = await listProducts({
    locale,
    collectionHandle: handle,
    page: Number(query.page) || 1,
  });
  return { collection, translated, result, store };
}
