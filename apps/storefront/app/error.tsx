"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { getStorefrontMessages } from "../lib/i18n";
import { localeFromPath } from "../../../packages/i18n/src/customer";
import { DocumentLanguage } from "../../../packages/i18n/src/document-language";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const locale = localeFromPath(usePathname(), useSearchParams().get("locale"));
  const m = getStorefrontMessages(locale).common;
  return (
    <main>
      <DocumentLanguage locale={locale} />
      <h1>{m.unavailableTitle}</h1>
      <p>{m.retryMessage}</p>
      <button onClick={reset}>{m.retry}</button>
    </main>
  );
}
