"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { textFor } from "@supastore/i18n/messages";
import { localeFromPath } from "@supastore/i18n/customer";
import { DocumentLanguage } from "../../../../packages/i18n/src/document-language";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const locale = localeFromPath(usePathname(), useSearchParams().get("locale"));
  const m = textFor(locale).common;
  return (
    <section>
      <DocumentLanguage locale={locale} />
      <h1>{m.unavailableTitle}</h1>
      <p>{m.retryMessage}</p>
      <button onClick={reset}>{m.retry}</button>
    </section>
  );
}
