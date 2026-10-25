/** Accept common typed and pasted variations of order and payment numbers. */
export function normalizeDisplayReference(value: string): string {
  const trimmed = value.trim().toUpperCase();
  const match = /^(ORD|PAY)(\d+)$/.exec(trimmed.replace(/[\s-]/g, ""));
  if (!match) return trimmed;
  const number = match[2]!.replace(/^0+(?=\d)/, "").padStart(6, "0");
  return `${match[1]}-${number}`;
}
