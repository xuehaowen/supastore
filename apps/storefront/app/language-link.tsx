"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { getStorefrontMessages } from "../lib/i18n";
export function LanguageLink({ locale }: { locale: string }) {
  const path = usePathname(),
    query = useSearchParams().toString();
  return (
    <Link
      href={
        path.replace(/^\/(en|zh)(?=\/|$)/, locale === "zh" ? "/en" : "/zh") +
        (query ? `?${query}` : "")
      }
    >
      {getStorefrontMessages(locale).common.languageName}
    </Link>
  );
}
