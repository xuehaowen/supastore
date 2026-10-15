// Parse decimal text without floating-point rounding or silently accepting exponents.
export function decimalToMinor(
  value: string,
  precision: number,
  signed = false,
): number | null {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6)
    return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(value) || (!signed && value.startsWith("-")))
    return null;
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  if (fraction.length > precision) return null;
  const result =
    Number(whole! + fraction.padEnd(precision, "0")) *
    (value.startsWith("-") ? -1 : 1);
  return Number.isSafeInteger(result) && Math.abs(result) <= 2147483647
    ? result
    : null;
}

export function minorToDecimal(value: number, precision: number): string {
  const digits = String(Math.abs(value)).padStart(precision + 1, "0");
  return `${value < 0 ? "-" : ""}${precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits}`;
}
