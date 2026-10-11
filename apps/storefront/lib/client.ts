import { responseData, responseMessage } from "./response";
import { fetchJson, TransportError } from "./fetch-json";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}
export function request(
  path: string,
  body?: Record<string, unknown>,
  method?: string,
): Promise<unknown>;
export function request<T>(
  path: string,
  body: Record<string, unknown> | undefined,
  method: string,
  decode: (value: unknown) => T,
): Promise<T>;
export async function request(
  path: string,
  body?: Record<string, unknown>,
  method = "POST",
  decode?: (value: unknown) => unknown,
): Promise<unknown> {
  const { response, data, requestId } = await fetchJson(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch((error: unknown) => {
    if (error instanceof TransportError)
      throw new ApiError(error.message, error.status, error.requestId);
    throw error;
  });
  if (!response.ok)
    throw new ApiError(
      responseMessage(data, "Unable to complete request."),
      response.status,
      requestId,
    );
  try {
    const value = responseData(data, path.startsWith("v1/"));
    return decode ? decode(value) : value;
  } catch {
    throw new ApiError("Invalid API response.", 502, requestId);
  }
}
