import en from "./locales/en.json";
import zh from "./locales/zh.json";

export const storefrontMessages = { en, zh };
export type StorefrontMessages = typeof en;

export function getStorefrontMessages(locale: string): StorefrontMessages {
  return storefrontMessages[locale === "zh" ? "zh" : "en"] || en;
}
