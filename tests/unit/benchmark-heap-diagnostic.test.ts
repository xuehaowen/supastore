import { expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { parseBenchmarkOptions } from "../../scripts/benchmark/options.mjs";
import {
  captureHeapSample,
  diagnosticTarget,
} from "../../scripts/benchmark/heap-probe.mjs";

it.each(["natural", "gc"])(
  "keeps %s heap diagnosis outside standard acceptance",
  (mode) => {
    expect(
      parseBenchmarkOptions(["--benchmark", "--diagnose-memory=" + mode]),
    ).toMatchObject({
      mode: "heap-diagnostic",
      diagnostics: mode,
      warmupSeconds: 30,
      measurementSeconds: 120,
    });
  },
);
it.each([
  { args: ["--benchmark", "--smoke", "--diagnose-memory=gc"] },
  { args: ["--benchmark", "--diagnose-memory=unknown"] },
])("rejects ambiguous or unknown diagnostics %#", ({ args }) => {
  expect(() => parseBenchmarkOptions(args)).toThrow(
    "Invalid benchmark options",
  );
});
it("captures finite runtime heap and external memory without collecting request data", () => {
  const sample = captureHeapSample("natural");
  expect(sample.forcedGc).toBe(false);
  for (const side of [sample.before, sample.after])
    for (const value of Object.values(side))
      expect(Number.isFinite(value)).toBe(true);
  expect(sample.after.heapSizeLimitBytes).toBeGreaterThan(
    sample.after.heapUsedBytes,
  );
  expect(sample.after).toHaveProperty("arrayBuffersBytes");
});
it("refuses forced-GC diagnosis when the runtime has no exposed GC", () => {
  vi.stubGlobal("gc", undefined);
  try {
    expect(() => captureHeapSample("gc")).toThrow("Explicit GC is unavailable");
  } finally {
    vi.unstubAllGlobals();
  }
});
it("observes real explicit collection of discarded allocations in an isolated Node process", () => {
  const moduleUrl = pathToFileURL(
    resolve("scripts/benchmark/heap-probe.mjs"),
  ).href;
  const source = `import { captureHeapSample } from ${JSON.stringify(moduleUrl)};
    globalThis.allocations = Array.from({length: 300000}, (_, i) => ({i, value: String(i)}));
    delete globalThis.allocations;
    console.log(JSON.stringify(captureHeapSample("gc")));`;
  const sample = JSON.parse(
    execFileSync(
      process.execPath,
      ["--expose-gc", "--input-type=module", "-e", source],
      { encoding: "utf8", windowsHide: true },
    ),
  );
  expect(sample.forcedGc).toBe(true);
  expect(sample.after.heapUsedBytes).toBeLessThan(sample.before.heapUsedBytes);
});
it.each([
  {},
  { BENCHMARK_MEMORY_ROLE: "backend", BENCHMARK_REPORT_PATH: "C:/production" },
  { BENCHMARK_MEMORY_ROLE: "worker" },
])("refuses unsafe preload destinations %#", (env) => {
  expect(() => diagnosticTarget(env)).toThrow("Owned heap diagnostic required");
});
