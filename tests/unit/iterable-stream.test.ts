import { expect, it } from "vitest";
import { textIterableStream } from "@/infrastructure/http/iterable-stream";

it("pulls bounded chunks and closes the source when the download is cancelled", async () => {
  let produced = 0;
  let closed = false;
  async function* source() {
    try {
      for (let index = 0; index < 1000; index++) {
        produced++;
        yield `row ${index}\n`;
      }
    } finally {
      closed = true;
    }
  }
  const reader = textIterableStream(source()).getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("row 0\n");
  expect(new TextDecoder().decode((await reader.read()).value)).toBe("row 1\n");
  await reader.cancel();
  expect(produced).toBeLessThanOrEqual(3);
  expect(closed).toBe(true);
});
it("propagates source failures instead of reporting a complete download", async () => {
  const failure = new Error("Synthetic source failure");
  async function* source() {
    yield "header\n";
    throw failure;
  }
  const reader = textIterableStream(source()).getReader();
  await reader.read();
  await expect(reader.read()).rejects.toBe(failure);
});
