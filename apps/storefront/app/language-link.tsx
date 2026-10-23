"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { textFor } from "@supastore/i18n/messages";

export function LanguageLink({ locale }: { locale: string }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return (
    <Link
      href={
        pathname.replace(
          /^\/(en|zh)(?=\/|$)/,
          locale === "en" ? "/zh" : "/en",
        ) + (query ? `?${query}` : "")
      }
    >
      {textFor(locale).common.languageName}
    </Link>
  );
}
