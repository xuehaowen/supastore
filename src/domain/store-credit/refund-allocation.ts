// Highest-averages cumulative allocation gives monotonic integer source caps.
// Compute lower quotas first, then award fewer than source-count remaining units.
export function allocateCumulativeRefund(
  totalRefunded: number,
  sources: { id: string; fundedCents: number }[],
) {
  if (
    !Number.isSafeInteger(totalRefunded) ||
    totalRefunded < 0 ||
    !sources.length ||
    sources.some(
      (s) => !Number.isSafeInteger(s.fundedCents) || s.fundedCents <= 0,
    ) ||
    new Set(sources.map((s) => s.id)).size !== sources.length
  )
    throw new Error("Invalid refund allocation.");
  const total = sources.reduce((sum, s) => sum + s.fundedCents, 0);
  if (!Number.isSafeInteger(total) || totalRefunded > total)
    throw new Error("Refund exceeds original funding.");
  const result = sources.map((s) => ({
    ...s,
    allocated: Number(
      (BigInt(totalRefunded) * BigInt(s.fundedCents)) / BigInt(total),
    ),
  }));
  let remaining =
    totalRefunded - result.reduce((sum, s) => sum + s.allocated, 0);
  while (remaining-- > 0) {
    const candidates = result.filter((s) => s.allocated < s.fundedCents);
    candidates.sort((a, b) => {
      const difference =
        BigInt(a.allocated + 1) * BigInt(b.fundedCents) -
        BigInt(b.allocated + 1) * BigInt(a.fundedCents);
      return difference < 0n
        ? -1
        : difference > 0n
          ? 1
          : a.id.localeCompare(b.id);
    });
    candidates[0]!.allocated++;
  }
  return new Map(result.map((s) => [s.id, s.allocated]));
}
