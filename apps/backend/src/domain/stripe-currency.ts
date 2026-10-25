// Verified charge units: https://docs.stripe.com/currencies (2026-10-06).
// Conservative supported subset from documented presentment, minimum-charge and
// zero-decimal lists. Unverified ISO codes fail closed; account availability varies.
const twoDecimal = new Set(
  "USD AED ARS AUD BRL CAD CHF CNY COP CZK DKK EUR GBP HKD HUF IDR ILS INR MXN MYR NOK NZD PHP PLN RON RUB SEK SGD THB TWD ZAR ISK UGX".split(
    " ",
  ),
);
const zeroDecimal = new Set(
  "BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF".split(" "),
);
export function stripeCurrencyIssue(
  currency: unknown,
  precision: unknown,
  amountMinor?: number,
): string | null {
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency))
    return "Currency is not verified for Stripe payments.";
  const code = currency.toUpperCase();
  const required = zeroDecimal.has(code) ? 0 : twoDecimal.has(code) ? 2 : null;
  if (required === null) return "Currency is not verified for Stripe payments.";
  if (precision !== required)
    return `Stripe requires ${code} payment precision ${required}; review payment configuration.`;
  if (amountMinor !== undefined) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0)
      return "Stripe payment amount has invalid minor units.";
    if ((code === "ISK" || code === "UGX") && amountMinor % 100 !== 0)
      return `Stripe requires whole ${code} amounts represented in two-decimal units.`;
  }
  return null;
}
