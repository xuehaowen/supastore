import { expect, it } from "vitest";
import { parseBenchmarkOptions } from "../../scripts/benchmark/options.mjs";
import { captureHeapSample, diagnosticTarget } from "../../scripts/benchmark/heap-probe.mjs";

it.each(["natural", "gc"])("keeps %s heap diagnosis outside standard acceptance", (mode) => {
  expect(parseBenchmarkOptions(["--benchmark", "--diagnose-memory=" + mode])).toMatchObject({
    mode: "heap-diagnostic", diagnostics: mode, warmupSeconds: 30, measurementSeconds: 120,
  });
});
it.each([
  ["--benchmark", "--smoke", "--diagnose-memory=gc"],
  ["--benchmark", "--diagnose-memory=unknown"],
])("rejects ambiguous or unknown diagnostics %#", (args) => {
  expect(() => parseBenchmarkOptions(args)).toThrow("Invalid benchmark options");
});
it("captures finite runtime heap and external memory without collecting request data", () => {
  const sample = captureHeapSample("natural");
  expect(sample.forcedGc).toBe(false);
  for (const side of [sample.before, sample.after])
    for (const value of Object.values(side)) expect(Number.isFinite(value)).toBe(true);
  expect(sample.after.heapSizeLimitBytes).toBeGreaterThan(sample.after.heapUsedBytes);
  expect(sample.after).toHaveProperty("arrayBuffersBytes");
});
it("refuses forced-GC diagnosis when the runtime has no exposed GC", () => {
  expect(() => captureHeapSample("gc", undefined)).toThrow("Explicit GC is unavailable");
});
it.each([
  {},
  { BENCHMARK_MEMORY_ROLE: "backend", BENCHMARK_REPORT_PATH: "C:/production" },
  { BENCHMARK_MEMORY_ROLE: "worker" },
])("refuses unsafe preload destinations %#", (env) => {
  expect(() => diagnosticTarget(env)).toThrow("Owned heap diagnostic required");
});
