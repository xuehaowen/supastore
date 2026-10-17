import type { Metadata } from "next";
import type { CustomerPageModels } from "@supastore/contracts";
import { textFor } from "@supastore/i18n/messages";
import { alternateLinks, publicOrigin } from "./seo";

type Store = CustomerPageModels["layout"]["store"];
const policyTitles = {
  about: "about",
  shipping: "shippingPolicy",
  returns: "returnsPolicy",
  privacy: "privacyPolicy",
} as const;
export function policyPresentation(store: Store, locale: string, slug: string) {
  if (
    !store ||
    !Object.hasOwn(policyTitles, slug) ||
    (locale !== "en" && locale !== "zh")
  )
    return null;
  const key = slug as keyof typeof policyTitles;
  const contentFor = (language: "en" | "zh") =>
    store.publicContent[language]?.[key] ||
    store.publicContent[store.defaultLocale as "en" | "zh"]?.[key];
  const content = contentFor(locale);
  if (!content) return null;
  return {
    content,
    title: textFor(locale).common[policyTitles[key]],
    locales: (["en", "zh"] as const).filter((language) =>
      Boolean(contentFor(language)),
    ),
  };
}
export function publicPageMetadata({
  locale,
  path,
  title,
  storeName,
  description,
  page = 1,
  locales,
}: {
  locale: string;
  path: string;
  title: string;
  storeName?: string | undefined;
  description?: string | undefined;
  page?: number;
  locales?: readonly ("en" | "zh")[];
}): Metadata {
  if (
    (locale !== "en" && locale !== "zh") ||
    (path && (!path.startsWith("/") || path.startsWith("//"))) ||
    /[?#]/.test(path) ||
    !Number.isSafeInteger(page) ||
    page < 1
  )
    throw new Error("Invalid public metadata route");
  const paginated = path + (page > 1 ? `?page=${page}` : "");
  const brand = storeName?.trim();
  return {
    title: {
      absolute: brand && title !== brand ? `${title} | ${brand}` : title,
    },
    description: description
      ? Array.from(description.replace(/\s+/g, " ").trim())
          .slice(0, 160)
          .join("")
      : undefined,
    alternates: {
      canonical: `${publicOrigin()}/${locale}${paginated}`,
      languages: alternateLinks(paginated, locales),
    },
  };
}
