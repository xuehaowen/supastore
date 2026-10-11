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
  const {
    response,
    data: result,
    requestId,
  } = await fetchJson(
    `${process.env.BACKEND_URL || "http://127.0.0.1:3000"}/api/v1/${path}`,
    { headers: { cookie: incoming.get("cookie") || "" }, cache: "no-store" },
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
