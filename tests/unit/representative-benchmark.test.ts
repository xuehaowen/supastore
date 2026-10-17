import { describe, expect, it } from "vitest";
import {
  analyzeMemory,
  benchmarkProtocol,
  fixtureProfile,
} from "../../scripts/benchmark/protocol";

const MiB = 1024 * 1024;
const timing = {
  durationSeconds: 1800,
  sampleEverySeconds: 5,
  windowSeconds: 300,
};
const limits = { peakMiB: 512, slopeMiBPerMinute: 1, medianGrowthMiB: 16 };
const samples = (growthMiBPerMinute = 0) =>
  Array.from({ length: 361 }, (_, index) => ({
    elapsedSeconds: index * 5,
    rssBytes: (200 + (index * 5 * growthMiBPerMinute) / 60) * MiB,
  }));

describe("representative benchmark protocol", () => {
  it("fixes the workload and leaves resource budgets uncalibrated until measured", () => {
    expect(benchmarkProtocol).toMatchObject({
      version: 1,
      workers: 8,
      warmupSeconds: 300,
      measurementSeconds: 1800,
      sampleEverySeconds: 5,
      memoryWindowSeconds: 300,
      resourceLimits: null,
      requestMix: {
        catalog: 30,
        search: 20,
        product: 15,
        cart: 10,
        checkout: 5,
        cartEdit: 10,
        quote: 5,
        order: 5,
      },
    });
    expect(
      Object.values(benchmarkProtocol.requestMix).reduce((a, b) => a + b, 0),
    ).toBe(100);
    expect(Object.isFrozen(benchmarkProtocol.requestMix)).toBe(true);
    expect(Object.isFrozen(benchmarkProtocol)).toBe(true);
  });

  it.each([100, 1000, 10000])(
    "defines exact fixture counts for %i products",
    (products) => {
      const profile = fixtureProfile(products, "mixed", true, true);
      expect(profile).toMatchObject({
        products,
        variants: products * 4,
        images: products * 2,
        historicalOrders: 10000,
        fulfillment: "mixed",
        rewards: true,
        trackedStock: true,
      });
      expect(profile.seed).toBe(
        fixtureProfile(products, "mixed", true, true).seed,
      );
    },
  );

  it.each(["shipping", "pickup", "mixed"])(
    "supports %s without requiring optional rewards or stock",
    (fulfillment) => {
      expect(fixtureProfile(100, fulfillment, false, false)).toMatchObject({
        fulfillment,
        rewards: false,
        trackedStock: false,
      });
    },
  );

  it.each([
    [0, "mixed", true, true],
    [1001, "mixed", true, true],
    ["1000", "mixed", true, true],
    [100, "delivery", true, true],
    [100, "mixed", "false", true],
    [100, "mixed", true, 0],
  ])(
    "rejects unsupported fixture options %j",
    (products, fulfillment, rewards, tracked) => {
      expect(() =>
        fixtureProfile(products, fulfillment, rewards, tracked),
      ).toThrow("Invalid fixture profile");
    },
  );
});

describe("memory stability acceptance", () => {
  it("passes a stable full measurement and reports MiB with signed growth", () => {
    expect(analyzeMemory(samples(), timing, limits)).toMatchObject({
      status: "pass",
      sampleCount: 361,
      peakMiB: 200,
      firstMedianMiB: 200,
      lastMedianMiB: 200,
      slopeMiBPerMinute: 0,
      medianGrowthMiB: 0,
      violations: [],
    });
    expect(analyzeMemory(samples(-1), timing, limits).status).toBe("pass");
  });

  it("detects a deliberate retention control even below the peak ceiling", () => {
    const result = analyzeMemory(samples(2), timing, limits);
    expect(result.status).toBe("fail");
    expect(result.peakMiB).toBe(260);
    expect(result.slopeMiBPerMinute).toBeCloseTo(2, 8);
    expect(result.medianGrowthMiB).toBeGreaterThan(49);
    expect(result.violations).toEqual(["slopeMiBPerMinute", "medianGrowthMiB"]);
  });

  it("checks transient peak usage independently of the growth trend", () => {
    const data = samples();
    data[180]!.rssBytes = 513 * MiB;
    expect(analyzeMemory(data, timing, limits).violations).toEqual(["peakMiB"]);
  });

  it("uses median windows instead of a single endpoint and handles irregular sampling", () => {
    const data = samples();
    data[0]!.rssBytes = 400 * MiB;
    data[360]!.rssBytes = 300 * MiB;
    const result = analyzeMemory(
      data.filter((_, i) => i !== 100),
      timing,
      limits,
    );
    expect(result.status).toBe("pass");
    expect(result.medianGrowthMiB).toBe(0);
  });

  it("does not certify an uncalibrated baseline", () => {
    expect(analyzeMemory(samples(), timing, null).status).toBe("uncalibrated");
  });

  it.each([
    [],
    samples().slice(0, 13),
    samples().slice(2),
    samples().slice(0, -2),
    samples().filter((_, i) => i < 90 || i > 94),
    samples().filter((_, i) => i % 10 === 0),
  ])("refuses incomplete or discontinuous measurements %#", (data) => {
    expect(analyzeMemory(data, timing, limits).status).toBe(
      "insufficient-data",
    );
  });

  it.each([
    [{ elapsedSeconds: 0, rssBytes: NaN }],
    [{ elapsedSeconds: 0, rssBytes: -1 }],
    [{ elapsedSeconds: Infinity, rssBytes: MiB }],
    [{ elapsedSeconds: -1, rssBytes: MiB }],
    [{ elapsedSeconds: 1801, rssBytes: MiB }],
    [
      { elapsedSeconds: 1, rssBytes: MiB },
      { elapsedSeconds: 1, rssBytes: MiB },
    ],
    [
      { elapsedSeconds: 2, rssBytes: MiB },
      { elapsedSeconds: 1, rssBytes: MiB },
    ],
  ])(
    "rejects corrupt observations %# rather than producing a passing report",
    (data) => {
      expect(() => analyzeMemory(data, timing, limits)).toThrow(
        "Invalid memory samples",
      );
    },
  );

  it.each([
    { ...timing, durationSeconds: 0 },
    { ...timing, sampleEverySeconds: -1 },
    { ...timing, windowSeconds: 901 },
    { ...timing, windowSeconds: NaN },
    { ...timing, sampleEverySeconds: 600 },
  ])("rejects invalid measurement timing %#", (settings) => {
    expect(() => analyzeMemory(samples(), settings, limits)).toThrow(
      "Invalid memory timing",
    );
  });

  it.each([
    { ...limits, peakMiB: 0 },
    { ...limits, slopeMiBPerMinute: Infinity },
    { ...limits, medianGrowthMiB: -1 },
  ])("rejects invalid frozen limits %#", (budget) => {
    expect(() => analyzeMemory(samples(), timing, budget)).toThrow(
      "Invalid memory limits",
    );
  });
});
