import { headers } from "next/headers";
import { responseData, responseMessage } from "./response";
export class BackendApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function readApi<T>(
  path: string,
  decode: (value: unknown) => T,
): Promise<T> {
  const incoming = await headers();
  const response = await fetch(
    `${process.env.BACKEND_URL || "http://127.0.0.1:3000"}/api/v1/${path}`,
    { headers: { cookie: incoming.get("cookie") || "" }, cache: "no-store" },
  );
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new BackendApiError(
      responseMessage(result, "Store temporarily unavailable."),
      response.status,
    );
  try {
    return decode(responseData(result, true));
  } catch {
    throw new BackendApiError("Invalid API response.", 502);
  }
}
export type {
  CartDto as Cart,
  ProductDto as Product,
  StoreDto as Store,
} from "@supastore/contracts";
export { money } from "./money";
