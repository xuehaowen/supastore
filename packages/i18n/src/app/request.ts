import { getRequestConfig } from "next-intl/server";
import { messages } from "./messages";
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested === "zh" ? "zh" : "en";
  return { locale, messages: messages[locale] };
});
