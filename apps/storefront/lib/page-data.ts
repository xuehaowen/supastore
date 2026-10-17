import type { CustomerPageModels as PageModels } from "@supastore/contracts";
import { parseCustomerPage } from "@supastore/contracts/customer-page-validation";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BackendApiError, readApi, readPublicApi } from "./api";

/** Every customer page reads the public contract through HTTP. */
export async function readPage<K extends keyof PageModels>(
  page: K,
  locale: string,
  query: Record<string, string | string[] | undefined> = {},
): Promise<PageModels[K]> {
  if (locale !== "en" && locale !== "zh") notFound();
  const search = new URLSearchParams({ locale });
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== undefined) search.append(key, item);
    }
  }
  const read = page === "catalog" ? readPublicApi : readApi;
  return read(`customer-pages/${page}?${search}`, (data) =>
    parseCustomerPage(page, data),
  ).catch((error) => {
    if (error instanceof BackendApiError && error.status === 404) notFound();
    throw error;
  });
}

// Metadata and page rendering share one live stock read within an RSC request.
// React's request cache does not persist customer or inventory data across requests.
export const readProductPage = cache((locale: string, handle: string) =>
  readPage("product", locale, { handle }),
);
