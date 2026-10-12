import { stripeCurrencyIssue } from "@/domain/stripe-currency";
export function stripeConfiguredFor(
  settings: { currency: string; precision: number } | undefined,
) {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    settings &&
    !stripeCurrencyIssue(settings.currency, settings.precision),
  );
}
