export type { Store, Product, Cart } from "./api";
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
