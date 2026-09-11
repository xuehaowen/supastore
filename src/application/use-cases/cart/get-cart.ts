import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db } from '@/infrastructure/db';
import {
  carts,
  cartItems,
  productVariants,
  products,
  productImages,
  productTranslations,
} from '@/infrastructure/db/schema';

export interface GetCartInput {
  guestSessionId?: string;
  cartId?: string;
  locale?: string;
}

export interface CartItemDetail {
  id: string;
  variantId: string;
  sku: string;
  title: string;
  productTitle: string;
  productHandle: string;
  priceCents: number;
  quantity: number;
  lineTotalCents: number;
  isAvailable: boolean;
  imageKey: string | null;
}

export interface CartDetail {
  id: string;
  guestSessionId: string;
  revision: number;
  items: CartItemDetail[];
  subtotalCents: number;
  itemCount: number;
}

export async function getCart(input: GetCartInput): Promise<CartDetail | null> {
  const { guestSessionId, cartId, locale = 'en' } = input;

  if (!guestSessionId && !cartId) {
    throw new Error('Either guestSessionId or cartId must be provided');
  }

  const conditions = [isNull(carts.convertedOrderId)];
  if (cartId) {
    conditions.push(eq(carts.id, cartId));
  }
  if (guestSessionId) {
    conditions.push(eq(carts.guestSessionId, guestSessionId));
  }

  const [cart] = await db
    .select()
    .from(carts)
    .where(and(...conditions))
    .orderBy(carts.createdAt)
    .limit(1);

  if (!cart) {
    return null;
  }

  // Fetch cart items
  const items = await db
    .select({
      id: cartItems.id,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      sku: productVariants.sku,
      variantTitle: productVariants.title,
      priceCents: productVariants.priceCents,
      isAvailable: productVariants.isAvailable,
      isPublished: products.isPublished,
      productId: products.id,
      productHandle: products.handle,
      productTitle: products.title,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.variantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(cartItems.cartId, cart.id))
    .orderBy(cartItems.createdAt);

  if (items.length === 0) {
    return {
      id: cart.id,
      guestSessionId: cart.guestSessionId,
      revision: cart.revision,
      items: [],
      subtotalCents: 0,
      itemCount: 0,
    };
  }

  const productIds = Array.from(new Set(items.map((i) => i.productId)));

  // Batch fetch translations and images
  const [translations, images] = await Promise.all([
    db
      .select()
      .from(productTranslations)
      .where(
        and(
          inArray(productTranslations.productId, productIds),
          eq(productTranslations.locale, locale),
        ),
      ),
    db
      .select({
        productId: productImages.productId,
        variantId: productImages.variantId,
        s3Key: productImages.s3Key,
      })
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(productImages.sortOrder),
  ]);

  const translationMap = new Map(translations.map((t) => [t.productId, t.title]));
  const imageMap = new Map<string, string>();
  for (const img of images) {
    if (img.variantId && !imageMap.has(`var_${img.variantId}`)) {
      imageMap.set(`var_${img.variantId}`, img.s3Key);
    }
    if (!imageMap.has(`prod_${img.productId}`)) {
      imageMap.set(`prod_${img.productId}`, img.s3Key);
    }
  }

  let subtotalCents = 0;
  let itemCount = 0;

  const itemDetails: CartItemDetail[] = items.map((i) => {
    const lineTotal = i.priceCents * i.quantity;
    subtotalCents += lineTotal;
    itemCount += i.quantity;

    const imgKey = imageMap.get(`var_${i.variantId}`) ?? imageMap.get(`prod_${i.productId}`) ?? null;
    const translatedTitle = translationMap.get(i.productId) ?? i.productTitle;

    return {
      id: i.id,
      variantId: i.variantId,
      sku: i.sku,
      title: i.variantTitle,
      productTitle: translatedTitle,
      productHandle: i.productHandle,
      priceCents: i.priceCents,
      quantity: i.quantity,
      lineTotalCents: lineTotal,
      isAvailable: i.isAvailable && i.isPublished,
      imageKey: imgKey,
    };
  });

  return {
    id: cart.id,
    guestSessionId: cart.guestSessionId,
    revision: cart.revision,
    items: itemDetails,
    subtotalCents,
    itemCount,
  };
}
