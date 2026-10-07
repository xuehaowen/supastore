export type { Store, Product, Cart } from "./api";
export const money = (value: number, currency = "USD", precision = 2) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).format(
    value / 10 ** precision,
  );
