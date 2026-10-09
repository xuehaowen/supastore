import { headers } from "next/headers";
export class BackendApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function readApi<T>(path: string): Promise<T> {
  const incoming = await headers();
  const response = await fetch(
    `${process.env.BACKEND_URL || "http://127.0.0.1:3000"}/api/v1/${path}`,
    { headers: { cookie: incoming.get("cookie") || "" }, cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok)
    throw new BackendApiError(
      result.error?.message || "Store temporarily unavailable.",
      response.status,
    );
  return result.data as T;
}
export const money = (
  value: number,
  currency = "USD",
  precision = 2,
  locale = "en",
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value / 10 ** precision);
export type {
  StoreDto as Store,
  ProductDto as Product,
  CartDto as Cart,
} from "@supastore/contracts";
