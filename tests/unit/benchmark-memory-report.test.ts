import { describe, expect, it } from "vitest";
import { analyzeBenchmarkMemory } from "../../scripts/benchmark/memory-report";

const series = () =>
  Array.from({ length: 361 }, (_, i) => ({
    elapsedSeconds: i * 5,
    rssBytes: 200 * 1024 * 1024,
  }));
const artifact = () => ({
  protocolVersion: 1,
  phase: "measurement",
  environment: {
    platform: "win32",
    runtime: "Next CLI",
    products: 1000,
    fulfillment: "mixed",
    rewards: true,
    trackedStock: true,
  },
  services: { backend: series(), storefront: series(), postgres: series() },
});

describe("retained benchmark memory report", () => {
  it.each([
    { platform: "linux" },
    { runtime: "standalone" },
    { products: 10000 },
    { fulfillment: "pickup" },
    { rewards: false },
    { trackedStock: false },
  ])(
    "does not certify an environment outside the frozen calibration %#",
    (change) => {
      const input = artifact();
      Object.assign(input.environment, change);
      expect(analyzeBenchmarkMemory(input)).toMatchObject({
        status: "inapplicable",
        budgetApplicable: false,
        budgetScope: { platform: "win32", runtime: "Next CLI", products: 1000 },
      });
    },
  );
  it("keeps legacy observations readable without silently certifying their environment", () => {
    const { environment: _environment, ...input } = artifact();
    expect(analyzeBenchmarkMemory(input)).toMatchObject({
      status: "inapplicable",
      budgetApplicable: false,
    });
  });
  it("reports every service separately without claiming complete benchmark acceptance", () => {
    expect(analyzeBenchmarkMemory(artifact())).toMatchObject({
      scope: "memory-only",
      protocolVersion: 1,
      status: "pass",
      benchmarkAcceptance: "not-evaluated",
      services: {
        backend: { status: "pass", peakMiB: 200 },
        storefront: { status: "pass", peakMiB: 200 },
        postgres: { status: "pass", peakMiB: 200 },
      },
    });
  });

  it.each([
    ["backend", 769],
    ["storefront", 641],
    ["postgres", 3073],
  ] as const)(
    "enforces the calibrated %s peak independently",
    (service, peak) => {
      const input = artifact();
      input.services[service] = series().map((row) => ({
        ...row,
        rssBytes: peak * 1024 * 1024,
      }));
      const result = analyzeBenchmarkMemory(input);
      expect(result.status).toBe("fail");
      expect(result.services[service]).toMatchObject({
        status: "fail",
        violations: ["peakMiB"],
      });
      for (const other of ["backend", "storefront", "postgres"] as const)
        if (other !== service)
          expect(result.services[other].status).toBe("pass");
    },
  );

  it("refuses sustained growth even when all peaks have headroom", () => {
    const input = artifact();
    for (const service of ["backend", "storefront", "postgres"] as const)
      input.services[service] = series().map((row) => ({
        ...row,
        rssBytes: (200 + (row.elapsedSeconds / 60) * 2) * 1024 * 1024,
      }));
    const result = analyzeBenchmarkMemory(input);
    expect(result.status).toBe("fail");
    for (const service of Object.values(result.services))
      expect(service).toMatchObject({
        status: "fail",
        violations: ["slopeMiBPerMinute", "medianGrowthMiB"],
      });
  });

  it("refuses to substitute a short smoke run for a standard run", () => {
    const input = artifact();
    input.services.backend = series().slice(0, 13);
    expect(analyzeBenchmarkMemory(input).status).toBe("insufficient-data");
  });

  it.each([
    null,
    {},
    { ...artifact(), protocolVersion: 2 },
    { ...artifact(), phase: "warmup" },
    { ...artifact(), services: { backend: series(), storefront: series() } },
    {
      ...artifact(),
      services: {
        ...artifact().services,
        backend: [{ elapsedSeconds: 0, rssBytes: "200" }],
      },
    },
    { ...artifact(), timing: { durationSeconds: 60 } },
    { ...artifact(), resourceLimits: { peakMiB: 99999 } },
  ])(
    "rejects malformed, incompatible or threshold-overriding input %#",
    (input) => {
      expect(() => analyzeBenchmarkMemory(input)).toThrow(
        "Invalid benchmark memory artifact",
      );
    },
  );
});
