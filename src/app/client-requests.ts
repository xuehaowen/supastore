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

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

function errorMessage(payload: Record<string, unknown> | null, fallback: string) {
  const nested = payload?.error;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object" && "message" in nested) {
    const message = (nested as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof payload?.message === "string" && payload.message) return payload.message;
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

export async function uploadEvidence(orderId: string, file: Blob): Promise<UploadIntent> {
  const intentResponse = await fetch("/api/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, mime: file.type, size: file.size }),
  });
  const intentData = await readJson(intentResponse);
  if (!intentResponse.ok) {
    throw new Error(errorMessage(intentData, "Upload failed. Please try again."));
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
    throw new Error(errorMessage(uploadData, "Upload interrupted. Please retry."));
  }

  const finalizeResponse = await fetch("/api/evidence", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, intentId }),
  });
  const finalizeData = await readJson(finalizeResponse);
  if (!finalizeResponse.ok) {
    throw new Error(errorMessage(finalizeData, "Upload failed. Please try again."));
  }
  return { intentId };
}

export async function importProductsCsv(file: File): Promise<ProductImportResult> {
  const { parseProductCsv, serializeProductCsv } = await import("@/domain/catalog/product-csv");
  const parsed = await file.text().then(parseProductCsv);
  if (!parsed.errors.length && parsed.rows.length > 100) {
    const groups = new Map<string, typeof parsed.rows>();
    for (const row of parsed.rows) { const group = groups.get(row.handle) || []; group.push(row); groups.set(row.handle, group); }
    const batches: (typeof parsed.rows)[] = [];
    let batch: typeof parsed.rows = [];
    for (const group of groups.values()) { if (group.length > 50) throw new Error("A product supports up to 50 variant rows. Split the file by product and correct its options."); if (batch.length + group.length > 100) { batches.push(batch); batch = []; } batch.push(...group); }
    if (batch.length) batches.push(batch);
    let created = 0, updated = 0;
    for (const [index, rows] of batches.entries()) {
      try { const result = await importProductsCsv(new File([serializeProductCsv(rows)], `batch-${index + 1}.csv`, { type: "text/csv" })); created += result.created || 0; updated += result.updated || 0; }
      catch(error) { throw new Error(`Batch ${index + 1} failed after ${created} created and ${updated} updated variants. Earlier batches are saved. Retry the same file to resume by SKU. ${error instanceof Error ? error.message : "Import failed."}`); }
    }
    return { success: true, created, updated };
  }
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/admin/imports/products", {
    method: "POST",
    body: formData,
  });
  const data = (await readJson(response)) as ProductImportResult | null;
  if (!response.ok || !data?.success) {
    const validation = data?.errors
      ?.map((error) => `Line ${error.line}: ${error.message}`)
      .join("; ");
    throw new Error(data?.error ?? validation ?? "Import failed");
  }
  return data;
}

export async function downloadAdminExport(type: "products" | "orders") {
  const response = await fetch(`/api/admin/exports/${type}`);
  if (!response.ok) {
    throw new Error(errorMessage(await readJson(response), "Unable to download the export."));
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? `${type}.csv`;
  return { blob: await response.blob(), filename };
}
