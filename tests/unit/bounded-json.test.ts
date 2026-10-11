import { expect, it } from "vitest";
import { boundedJson } from "@/infrastructure/http/bounded-json";
it("reads bounded JSON without trusting content-length", async () => {
  expect(await boundedJson(Response.json({ ok: true }))).toEqual({ ok: true });
  await expect(
    boundedJson(
      new Response('"' + "x".repeat(100) + '"', {
        headers: { "content-length": "1" },
      }),
      { maxBytes: 32 },
    ),
  ).rejects.toThrow("too large");
});
it("times out stalled bodies and cancels the reader", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull() {
        return new Promise(() => {});
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await expect(boundedJson(response, { timeoutMs: 10 })).rejects.toThrow(
    "timed out",
  );
  expect(cancelled).toBe(true);
});
