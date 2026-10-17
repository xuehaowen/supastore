import * as v from "valibot";
const kinds = ["html", "rsc", "script", "image", "other"] as const;
const bytes = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const timing = v.pipe(v.number(), v.finite(), v.minValue(0));
const observation = v.object({
  kind: v.picklist(kinds),
  encodedBytes: bytes,
  status: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(100), v.maxValue(599)),
  ),
  fromCache: v.boolean(),
  canceled: v.optional(v.boolean(), false),
});
export function summarizeTransfers(input: unknown) {
  const transfers = v.parse(v.array(observation), input);
  const encodedBytes = { html: 0, rsc: 0, script: 0, image: 0, other: 0 };
  for (const transfer of transfers)
    encodedBytes[transfer.kind] += transfer.encodedBytes;
  return {
    encodedBytes,
    requests: transfers.length,
    cachedRequests: transfers.filter((t) => t.fromCache).length,
    canceledRequests: transfers.filter((t) => t.canceled).length,
    unexpectedFailures: transfers.filter(
      (t) =>
        !t.canceled &&
        t.kind !== "other" &&
        (t.status === null || (t.status >= 400 && t.status !== 304)),
    ).length,
  };
}
export type TransferSummary = ReturnType<typeof summarizeTransfers>;
export interface BrowserSample {
  route: string;
  cache: "cold" | "warm";
  ttfbMs: number;
  domContentLoadedMs: number;
  transfers: TransferSummary;
}
const sample = v.object({
  route: v.picklist(["catalog", "search", "product", "cart", "checkout"]),
  cache: v.picklist(["cold", "warm"]),
  ttfbMs: timing,
  domContentLoadedMs: timing,
  transfers: v.object({
    encodedBytes: v.object({
      html: bytes,
      rsc: bytes,
      script: bytes,
      image: bytes,
      other: bytes,
    }),
  }),
});
function percentiles(values: number[]) {
  values.sort((a, b) => a - b);
  return {
    p50: values[Math.ceil(values.length * 0.5) - 1]!,
    p95: values[Math.ceil(values.length * 0.95) - 1]!,
  };
}
export function summarizeBrowserSamples(input: unknown) {
  const samples = v.parse(v.array(sample), input);
  return Object.fromEntries(
    [...new Set(samples.map((s) => s.route))].map((route) => [
      route,
      Object.fromEntries(
        ["cold", "warm"].map((cache) => {
          const selected = samples.filter(
            (s) => s.route === route && s.cache === cache,
          );
          return [
            cache,
            {
              samples: selected.length,
              ttfbMs: selected.length
                ? percentiles(selected.map((s) => s.ttfbMs))
                : null,
              domContentLoadedMs: selected.length
                ? percentiles(selected.map((s) => s.domContentLoadedMs))
                : null,
              encodedBytes: Object.fromEntries(
                kinds.map((kind) => [
                  kind,
                  selected.length
                    ? percentiles(
                        selected.map((s) => s.transfers.encodedBytes[kind]),
                      )
                    : null,
                ]),
              ),
            },
          ];
        }),
      ),
    ]),
  );
}
