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
  services: { backend: series(), storefront: series(), postgres: series() },
});

describe("retained benchmark memory report", () => {
  it("reports every service separately without claiming complete benchmark acceptance", () => {
    expect(analyzeBenchmarkMemory(artifact())).toMatchObject({
      scope: "memory-only",
      protocolVersion: 1,
      status: "uncalibrated",
      benchmarkAcceptance: "not-evaluated",
      services: {
        backend: { status: "uncalibrated", peakMiB: 200 },
        storefront: { status: "uncalibrated", peakMiB: 200 },
        postgres: { status: "uncalibrated", peakMiB: 200 },
      },
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
