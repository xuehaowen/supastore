import * as v from "valibot";
import { analyzeMemory, benchmarkProtocol } from "./protocol";

const sample = v.strictObject({
  elapsedSeconds: v.pipe(v.number(), v.finite()),
  rssBytes: v.pipe(v.number(), v.finite()),
});
const series = v.pipe(v.array(sample), v.maxLength(10000));
const artifact = v.strictObject({
  protocolVersion: v.literal(benchmarkProtocol.version),
  phase: v.literal("measurement"),
  services: v.strictObject({
    backend: series,
    storefront: series,
    postgres: series,
  }),
});

/** Analyze retained observations without contacting a service or mutating data. */
export function analyzeBenchmarkMemory(input: unknown) {
  const parsed = v.safeParse(artifact, input);
  if (!parsed.success) throw new Error("Invalid benchmark memory artifact");
  const timing = {
    durationSeconds: benchmarkProtocol.measurementSeconds,
    sampleEverySeconds: benchmarkProtocol.sampleEverySeconds,
    windowSeconds: benchmarkProtocol.memoryWindowSeconds,
  };
  const services = {
    backend: analyzeMemory(
      parsed.output.services.backend,
      timing,
      benchmarkProtocol.resourceLimits.backend,
    ),
    storefront: analyzeMemory(
      parsed.output.services.storefront,
      timing,
      benchmarkProtocol.resourceLimits.storefront,
    ),
    postgres: analyzeMemory(
      parsed.output.services.postgres,
      timing,
      benchmarkProtocol.resourceLimits.postgres,
    ),
  };
  const results = Object.values(services);
  return {
    scope: "memory-only",
    protocolVersion: benchmarkProtocol.version,
    benchmarkAcceptance: "not-evaluated",
    status: results.some((result) => result.status === "insufficient-data")
      ? "insufficient-data"
      : results.some((result) => result.status === "fail")
        ? "fail"
        : results.some((result) => result.status === "uncalibrated")
          ? "uncalibrated"
          : "pass",
    services,
  };
}
