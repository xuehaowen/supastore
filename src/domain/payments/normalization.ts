/**
 * Versioned payment reference normalization rules.
 * Strips whitespace, dashes, dots, slashes, punctuation, and folds case.
 * Ensures consistent canonical references for bank transfers, Pix keys,
 * PromptPay IDs, and cash identifiers.
 */
export function normalizePaymentReference(raw: string): string {
  if (!raw || typeof raw !== "string") {
    return "";
  }

  // 1. Trim outer whitespace
  let cleaned = raw.trim();

  // 2. Strip common reference formatting characters (spaces, dashes, dots, slashes, underscores, colons)
  cleaned = cleaned.replace(/[\s\-_./:\\]+/g, "");

  // 3. Case-fold to uppercase for uniform alphanumeric comparison
  cleaned = cleaned.toUpperCase();

  return cleaned;
}

/**
 * Validates that a raw payment reference contains sufficient identifiable alphanumeric content.
 */
export function validatePaymentReference(raw: string): {
  isValid: boolean;
  normalized: string;
  error?: string;
} {
  const normalized = normalizePaymentReference(raw);

  if (!normalized || normalized.length < 3) {
    return {
      isValid: false,
      normalized: "",
      error: "Payment reference must contain at least 3 alphanumeric characters.",
    };
  }

  return {
    isValid: true,
    normalized,
  };
}
