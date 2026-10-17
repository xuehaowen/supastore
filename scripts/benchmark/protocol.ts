/** Change the version when workload semantics change; never compare unlike runs. */
export const benchmarkProtocol = Object.freeze({
  version: 1,
  workers: 8,
  warmupSeconds: 300,
  measurementSeconds: 1800,
  sampleEverySeconds: 5,
  memoryWindowSeconds: 300,
  resourceLimits: null,
  requestMix: Object.freeze({
    catalog: 30,
    search: 20,
    product: 15,
    cart: 10,
    checkout: 5,
    cartEdit: 10,
    quote: 5,
    order: 5,
  }),
});

/** Runtime checks also apply when this is called by an untyped CLI. */
export function fixtureProfile(
  products: unknown,
  fulfillment: unknown,
  rewards: unknown,
  trackedStock: unknown,
) {
  if (
    typeof products !== "number" ||
    ![100, 1000, 10000].includes(products) ||
    !["shipping", "pickup", "mixed"].includes(String(fulfillment)) ||
    typeof fulfillment !== "string" ||
    typeof rewards !== "boolean" ||
    typeof trackedStock !== "boolean"
  )
    throw new Error("Invalid fixture profile");
  return Object.freeze({
    seed: 20261016,
    products,
    variants: products * 4,
    images: products * 2,
    historicalOrders: 10000,
    fulfillment,
    rewards,
    trackedStock,
  });
}

export interface MemorySample {
  /** Seconds since measurement began; excludes warm-up. */
  elapsedSeconds: number;
  rssBytes: number;
}

export interface MemoryTiming {
  durationSeconds: number;
  sampleEverySeconds: number;
  windowSeconds: number;
}

export interface MemoryLimits {
  peakMiB: number;
  slopeMiBPerMinute: number;
  medianGrowthMiB: number;
}

export type MemoryAnalysis =
  | { status: "insufficient-data"; sampleCount: number }
  | (MemoryLimits & {
      status: "uncalibrated" | "pass" | "fail";
      sampleCount: number;
      firstMedianMiB: number;
      lastMedianMiB: number;
      violations: (keyof MemoryLimits)[];
    });

const MiB = 1024 * 1024;
const finite = (value: number) =>
  typeof value === "number" && Number.isFinite(value);

function median(values: number[]) {
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2
    ? values[middle]!
    : (values[middle - 1]! + values[middle]!) / 2;
}

/**
 * This certifies one service's memory series only, never benchmark correctness.
 * Sampling must cover the measurement and have no gap over two intervals.
 * Missing budgets deliberately cannot produce a pass.
 */
export function analyzeMemory(
  samples: readonly MemorySample[],
  timing: MemoryTiming,
  limits: MemoryLimits | null,
): MemoryAnalysis {
  const { durationSeconds, sampleEverySeconds, windowSeconds } = timing;
  if (
    ![durationSeconds, sampleEverySeconds, windowSeconds].every(finite) ||
    durationSeconds <= 0 ||
    sampleEverySeconds <= 0 ||
    windowSeconds < 2 * sampleEverySeconds ||
    windowSeconds * 2 > durationSeconds
  )
    throw new Error("Invalid memory timing");
  if (
    limits !== null &&
    (!finite(limits.peakMiB) ||
      limits.peakMiB <= 0 ||
      !finite(limits.slopeMiBPerMinute) ||
      limits.slopeMiBPerMinute < 0 ||
      !finite(limits.medianGrowthMiB) ||
      limits.medianGrowthMiB < 0)
  )
    throw new Error("Invalid memory limits");
  if (
    !Array.isArray(samples) ||
    samples.some(
      (sample, index) =>
        !sample ||
        !finite(sample.elapsedSeconds) ||
        sample.elapsedSeconds < 0 ||
        sample.elapsedSeconds > durationSeconds ||
        !finite(sample.rssBytes) ||
        sample.rssBytes <= 0 ||
        (index > 0 &&
          sample.elapsedSeconds <= samples[index - 1]!.elapsedSeconds),
    )
  )
    throw new Error("Invalid memory samples");
  const first = samples[0];
  const last = samples.at(-1);
  if (
    !first ||
    !last ||
    samples.length < Math.ceil((durationSeconds / sampleEverySeconds) * 0.9) ||
    first.elapsedSeconds > sampleEverySeconds ||
    last.elapsedSeconds < durationSeconds - sampleEverySeconds ||
    samples.some(
      (sample, index) =>
        index > 0 &&
        sample.elapsedSeconds - samples[index - 1]!.elapsedSeconds >
          2 * sampleEverySeconds,
    )
  )
    return {
      status: "insufficient-data" as const,
      sampleCount: samples.length,
    };

  const firstMedianMiB = median(
    samples
      .filter((sample) => sample.elapsedSeconds < windowSeconds)
      .map((sample) => sample.rssBytes / MiB),
  );
  const lastMedianMiB = median(
    samples
      .filter(
        (sample) => sample.elapsedSeconds > durationSeconds - windowSeconds,
      )
      .map((sample) => sample.rssBytes / MiB),
  );
  const meanMinutes =
    samples.reduce((sum, sample) => sum + sample.elapsedSeconds / 60, 0) /
    samples.length;
  const meanMiB =
    samples.reduce((sum, sample) => sum + sample.rssBytes / MiB, 0) /
    samples.length;
  let covariance = 0;
  let variance = 0;
  let peakMiB = 0;
  for (const sample of samples) {
    const minutes = sample.elapsedSeconds / 60 - meanMinutes;
    covariance += minutes * (sample.rssBytes / MiB - meanMiB);
    variance += minutes * minutes;
    peakMiB = Math.max(peakMiB, sample.rssBytes / MiB);
  }
  const measured = {
    peakMiB,
    slopeMiBPerMinute: covariance / variance,
    medianGrowthMiB: lastMedianMiB - firstMedianMiB,
  };
  const violations = limits
    ? (Object.keys(measured) as (keyof MemoryLimits)[]).filter(
        (key) => measured[key] > limits[key],
      )
    : [];
  return {
    status:
      limits === null ? "uncalibrated" : violations.length ? "fail" : "pass",
    sampleCount: samples.length,
    firstMedianMiB,
    lastMedianMiB,
    ...measured,
    violations,
  };
}
