import en from "./locales/en.json";
import zh from "./locales/zh.json";
import { sharedMessages } from "../../../packages/i18n/src/customer";

export const storefrontMessages = {
  en: { ...en, ...sharedMessages.en },
  zh: { ...zh, ...sharedMessages.zh },
};
export type StorefrontMessages = typeof storefrontMessages.en;

export function getStorefrontMessages(locale: string): StorefrontMessages {
  return storefrontMessages[locale === "zh" ? "zh" : "en"] || en;
}
