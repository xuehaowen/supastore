import { headers } from "next/headers";
import Link from "next/link";
import { textFor } from "@supastore/i18n/messages";
import { DocumentLanguage } from "../../../packages/i18n/src/document-language";
export default async function NotFound() {
  const locale = (await headers()).get("x-store-locale") === "zh" ? "zh" : "en",
    m = textFor(locale).common;
  return (
    <main className="storefront-state">
      <DocumentLanguage locale={locale} />
      <h1>{m.notFoundTitle}</h1>
      <p>{m.notFoundMessage}</p>
      <Link href={`/${locale}`}>{m.backToShop}</Link>
    </main>
  );
}
