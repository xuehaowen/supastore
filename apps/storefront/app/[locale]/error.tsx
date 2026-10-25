"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { textFor } from "@supastore/i18n/messages";
import { localeFromPath } from "@supastore/i18n/customer";
import { DocumentLanguage } from "../../../../packages/i18n/src/document-language";
import Link from "next/link";
import { Button } from "@supastore/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const locale = localeFromPath(usePathname(), useSearchParams().get("locale"));
  const m = textFor(locale).common;
  return (
    <section className="storefront-state">
      <DocumentLanguage locale={locale} />
      <h1>{m.unavailableTitle}</h1>
      <p>{m.retryMessage}</p>
      <div className="storefront-state-actions">
        <Button onClick={reset}>{m.retry}</Button>
        <Link href={`/${locale}`}>{m.backToShop}</Link>
      </div>
    </section>
  );
}
