import en from "./locales/en.json";
import zh from "./locales/zh.json";

export const messages = { en, zh };
export type AppMessages = typeof en;
export function textFor(locale: string): AppMessages {
  return messages[locale === "zh" ? "zh" : "en"];
}
