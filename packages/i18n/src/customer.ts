import en from "./locales/en.json";
import zh from "./locales/zh.json";

export const sharedMessages = { en, zh };
export function customerMessages(locale: string) {
  return sharedMessages[locale === "zh" ? "zh" : "en"];
}
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[.!。]+$/, "");
export function customerError(error: unknown, locale: string) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const m = customerMessages(locale);
  const english = en.errors as Record<string, string>;
  const localized = m.errors as Record<string, string>;
  const key = Object.keys(english).find(
    (key) =>
      normalize(english[key]!) === normalize(message) ||
      normalize(localized[key]!) === normalize(message),
  );
  if (key) return localized[key]!;
  // API/auth messages are protocol data. Unknown failures use localized copy,
  // rather than exposing provider text or leaking English into Chinese pages.
  if (/email.*not verified|email.*verif/i.test(message))
    return m.errors.verifyEmail;
  if (/password.*match/i.test(message)) return m.errors.passwordMismatch;
  if (/slot.*(full|capacity)|window.*full/i.test(message))
    return m.errors.fullWindow;
  return m.errors.generic;
}
export function statusLabel(status: string | null | undefined, locale: string) {
  if (!status) return "";
  const m = customerMessages(locale);
  return (
    (m.statuses as Record<string, string>)[status] ?? m.common.unknownStatus
  );
}
export function activityLabel(reason: string, locale: string) {
  const key = Object.keys(en.activityReasons).find(
    (key) => (en.activityReasons as Record<string, string>)[key] === reason,
  );
  return key
    ? (customerMessages(locale).activityReasons as Record<string, string>)[key]!
    : reason;
}
export function formatMoney(
  value: number,
  currency = "USD",
  precision = 2,
  locale = "en",
) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value / 10 ** precision);
}
export function formatLocalDate(value: string, locale: string) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return "";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}
export function localeFromPath(pathname: string, queryLocale?: string | null) {
  const match = /^\/(en|zh)(?:\/|$)/.exec(pathname);
  return match?.[1] === "zh" || (!match && queryLocale === "zh") ? "zh" : "en";
}
