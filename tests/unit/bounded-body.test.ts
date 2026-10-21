import { expect, it } from "vitest";
import { readBoundedBody, BodyTooLargeError } from "@/infrastructure/http/bounded-body";

it("reads exact boundary bytes and releases the stream lock", async () => {
  const body = new Response("hello").body!;
  expect(new TextDecoder().decode(await readBoundedBody(body, { maxBytes: 5 }))).toBe("hello");
  expect(body.locked).toBe(false);
});
it("cancels and releases streams that exceed the actual byte limit", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } });
  await expect(readBoundedBody(body, { maxBytes: 10 })).rejects.toBeInstanceOf(BodyTooLargeError);
  expect(cancelled).toBe(true);
  expect(body.locked).toBe(false);
});
it("rejects excessive or malformed declared lengths without pulling data", async () => {
  for (const contentLength of ["11", "invalid", "-1"]) {
    const body = new Response("short").body!;
    await expect(readBoundedBody(body, { maxBytes: 10, contentLength })).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(body.locked).toBe(false);
  }
});
it("releases the lock after a source error", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("source unavailable")); } });
  await expect(readBoundedBody(body, { maxBytes: 10 })).rejects.toThrow("source unavailable");
  expect(body.locked).toBe(false);
});
it("times out stalled input and cancels it", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } });
  await expect(readBoundedBody(body, { maxBytes: 10, timeoutMs: 10 })).rejects.toThrow("timed out");
  expect(cancelled).toBe(true);
  expect(body.locked).toBe(false);
});
