import { boundedJson, deadlineFetch as fetch } from "../lib/bounded-json";
export interface AuthPayload {
  name: FormDataEntryValue | null;
  email: FormDataEntryValue | null;
  password: FormDataEntryValue | null;
  callbackURL: string;
}

export interface UploadIntent {
  intentId: string;
}

export interface ProductImportResult {
  success: boolean;
  created?: number;
  updated?: number;
  error?: string;
  errors?: Array<{ line: number; field: string; message: string }>;
}

async function readJson(
  response: Response,
): Promise<Record<string, unknown> | null> {
  return (await boundedJson(response).catch(() => null)) as Record<
    string,
    unknown
  > | null;
}

function errorMessage(
  payload: Record<string, unknown> | null,
  fallback: string,
) {
  const nested = payload?.error;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object" && "message" in nested) {
    const message = (nested as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof payload?.message === "string" && payload.message)
    return payload.message;
  return fallback;
}

export async function signOutSession() {
  return fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function authenticate(
  mode: "sign-in" | "sign-up",
  payload: AuthPayload,
  options: { customer?: boolean } = {},
) {
  const response = await fetch(
    mode === "sign-up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = await readJson(response);
  if (!response.ok) {
    const message = errorMessage(
      data,
      "We couldn't sign you in. Please check your details and try again.",
    );
    if (options.customer && /verif/i.test(message)) {
      throw new Error(
        "Please verify your email before signing in. Check your inbox or spam folder for the verification link.",
      );
    }
    throw new Error(message);
  }
  return data;
}

export async function uploadEvidence(
  orderId: string,
  file: Blob,
): Promise<UploadIntent> {
  const intentResponse = await fetch("/api/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, mime: file.type, size: file.size }),
  });
  const intentData = await readJson(intentResponse);
  if (!intentResponse.ok) {
    throw new Error(
      errorMessage(intentData, "Upload failed. Please try again."),
    );
  }
  if (typeof intentData?.intentId !== "string" || !intentData.intentId) {
    throw new Error("Upload failed. Please try again.");
  }
  const intentId = intentData.intentId;

  const uploadResponse = await fetch(
    `/api/evidence/upload?orderId=${encodeURIComponent(orderId)}&intentId=${encodeURIComponent(intentId)}`,
    { method: "PUT", headers: { "Content-Type": file.type }, body: file },
  );
  const uploadData = await readJson(uploadResponse);
  if (!uploadResponse.ok) {
    throw new Error(
      errorMessage(uploadData, "Upload interrupted. Please retry."),
    );
  }

  const finalizeResponse = await fetch("/api/evidence", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, intentId }),
  });
  const finalizeData = await readJson(finalizeResponse);
  if (!finalizeResponse.ok) {
    throw new Error(
      errorMessage(finalizeData, "Upload failed. Please try again."),
    );
  }
  return { intentId };
}
