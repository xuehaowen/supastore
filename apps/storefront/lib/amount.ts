export function creditMinorUnits(amount: string, precision: number) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 4)
    throw new Error("Invalid store currency precision.");
  const parts = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!parts || (parts[2]?.length || 0) > precision)
    throw new Error("Enter a valid credit amount.");
  const value =
    Number(parts[1]) * 10 ** precision +
    Number((parts[2] || "").padEnd(precision, "0"));
  if (!Number.isSafeInteger(value) || value > 2147483647)
    throw new Error("Credit amount is too large.");
  return value;
}
