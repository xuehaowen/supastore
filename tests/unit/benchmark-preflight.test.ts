import { expect, it } from "vitest";
import {
  raceCases,
  validateRaceEvidence,
} from "../../scripts/benchmark/race-evidence";
import {
  summarizeTransfers,
  summarizeBrowserSamples,
} from "../../scripts/benchmark/browser-metrics";

const raceReport = () => ({
  success: true,
  numPassedTests: raceCases.length,
  numFailedTests: 0,
  testResults: [
    {
      assertionResults: raceCases.map((title) => ({
        title,
        status: "passed",
        duration: 10,
      })),
    },
  ],
});
it("retains exactly the named bounded race checks", () => {
  expect(validateRaceEvidence(raceReport()).cases).toHaveLength(5);
});
it.each([
  {},
  { ...raceReport(), numPassedTests: 0 },
  { ...raceReport(), success: false },
  { ...raceReport(), numFailedTests: 1 },
  { ...raceReport(), testResults: [] },
  {
    ...raceReport(),
    testResults: [
      {
        assertionResults: Array.from({ length: 5 }, () => ({
          title: raceCases[0],
          status: "passed",
          duration: 10,
        })),
      },
    ],
  },
])(
  "rejects missing, failed or accidentally skipped race evidence %#",
  (input) => {
    expect(() => validateRaceEvidence(input)).toThrow(
      "Incomplete bounded race evidence",
    );
  },
);
it("separates encoded transfer bytes and cached resources without collecting URLs", () => {
  expect(
    summarizeTransfers([
      { kind: "html", encodedBytes: 100, status: 200, fromCache: false },
      { kind: "rsc", encodedBytes: 30, status: 200, fromCache: false },
      { kind: "script", encodedBytes: 0, status: 200, fromCache: true },
      { kind: "image", encodedBytes: 20, status: 200, fromCache: false },
    ]),
  ).toMatchObject({
    encodedBytes: { html: 100, rsc: 30, script: 0, image: 20, other: 0 },
    requests: 4,
    cachedRequests: 1,
    unexpectedFailures: 0,
  });
});
it("counts resource and transport errors without misclassifying cache validation", () => {
  expect(
    summarizeTransfers([
      { kind: "script", encodedBytes: 0, status: 304, fromCache: true },
      { kind: "image", encodedBytes: 10, status: 404, fromCache: false },
      { kind: "html", encodedBytes: 0, status: null, fromCache: false },
    ]).unexpectedFailures,
  ).toBe(2);
});
it("rejects corrupt transfer observations", () => {
  expect(() =>
    summarizeTransfers([
      { kind: "image", encodedBytes: NaN, status: 200, fromCache: false },
    ]),
  ).toThrow();
});
it("reports small-sample cold/warm percentiles with their actual counts", () => {
  const samples = [10, 20, 30].flatMap((ttfbMs) =>
    ["cold", "warm"].map((cache) => ({
      route: "catalog",
      cache,
      ttfbMs,
      domContentLoadedMs: ttfbMs + 20,
      transfers: summarizeTransfers([]),
    })),
  );
  expect(summarizeBrowserSamples(samples)).toMatchObject({
    catalog: {
      cold: { samples: 3, ttfbMs: { p50: 20, p95: 30 } },
      warm: { samples: 3, domContentLoadedMs: { p50: 40, p95: 50 } },
    },
  });
});
