import { responseData, responseMessage } from "./response";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
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
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      responseMessage(data, "Unable to complete request."),
      response.status,
    );
  try {
    const value = responseData(data, path.startsWith("v1/"));
    return decode ? decode(value) : value;
  } catch {
    throw new ApiError("Invalid API response.", 502);
  }
}
