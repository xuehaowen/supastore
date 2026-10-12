import { headers } from "next/headers";
import { responseData, responseMessage } from "./response";
import { fetchJson, TransportError } from "./fetch-json";
export class BackendApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function readApi<T>(
  path: string,
  decode: (value: unknown) => T,
): Promise<T> {
  const incoming = await headers();
  return readDecoded(path, decode, {
    headers: { cookie: incoming.get("cookie") || "" },
    cache: "no-store",
  });
}

/** Only common public reads use 30-second revalidation; checkout reads current state. */
export function readPublicApi<T>(
  path: string,
  decode: (value: unknown) => T,
): Promise<T> {
  const route = path.split("?")[0]!;
  let permitted =
    route === "store" || route === "catalog" || route === "sitemap";
  if (route.startsWith("products/")) {
    try {
      const handle = decodeURIComponent(route.slice("products/".length));
      permitted =
        !!handle &&
        handle !== "." &&
        handle !== ".." &&
        !/[\\/?#%\x00-\x1f]/.test(handle);
    } catch {
      permitted = false;
    }
  }
  if (!permitted)
    return Promise.reject(new BackendApiError("Invalid public API path.", 400));
  const query = new URLSearchParams(path.slice(route.length + 1));
  const keys = [...query.keys()];
  const locale = query.get("locale");
  const knownLocale = locale === null || locale === "en" || locale === "zh";
  const commonCatalog =
    route === "catalog" &&
    knownLocale &&
    keys.every((key) =>
      ["locale", "page", "pageSize", "search", "category"].includes(key),
    ) &&
    !query.get("search") &&
    !query.get("category") &&
    (!query.has("page") || query.get("page") === "1") &&
    (!query.has("pageSize") || query.get("pageSize") === "24");
  const product =
    route.startsWith("products/") &&
    knownLocale &&
    keys.every((key) => key === "locale");
  const sitemap =
    route === "sitemap" &&
    keys.every((key) => key === "index" || key === "page") &&
    ((query.get("index") === "1" && !query.has("page")) ||
      (!query.has("index") &&
        /^[1-9]\d{0,4}$/.test(query.get("page") || "") &&
        Number(query.get("page")) <= 50000));
  const cacheable =
    !keys.some((key) => query.getAll(key).length > 1) &&
    ((route === "store" && !keys.length) ||
      commonCatalog ||
      product ||
      sitemap);
  return readDecoded(
    path,
    decode,
    cacheable
      ? {
          cache: "force-cache",
          next: { revalidate: 30 },
        }
      : { cache: "no-store" },
  );
}

async function readDecoded<T>(
  path: string,
  decode: (value: unknown) => T,
  init: RequestInit,
): Promise<T> {
  const {
    response,
    data: result,
    requestId,
  } = await fetchJson(
    `${process.env.BACKEND_URL || "http://127.0.0.1:3000"}/api/v1/${path}`,
    init,
  ).catch((error: unknown) => {
    if (error instanceof TransportError)
      throw new BackendApiError(error.message, error.status, error.requestId);
    throw error;
  });
  if (!response.ok)
    throw new BackendApiError(
      responseMessage(result, "Store temporarily unavailable."),
      response.status,
      requestId,
    );
  try {
    return decode(responseData(result, true));
  } catch {
    throw new BackendApiError("Invalid API response.", 502, requestId);
  }
}
export type {
  CartDto as Cart,
  ProductDto as Product,
  StoreDto as Store,
} from "@supastore/contracts";
export { money } from "./money";
