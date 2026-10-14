import en from "./locales/en.json";
import zh from "./locales/zh.json";
import { sharedMessages } from "../customer";

export const messages = {
  en: { ...en, ...sharedMessages.en },
  zh: { ...zh, ...sharedMessages.zh },
};
export type AppMessages = typeof messages.en;
export function textFor(locale: string): AppMessages {
  return messages[locale === "zh" ? "zh" : "en"];
}
