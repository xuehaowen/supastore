import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { benchmarkImages } from "../../scripts/benchmark/images.mjs";

const origin = "http://127.0.0.1:19009";
const key =
  "/browser-public-fixture/catalog/318ee7fa-b7e9-4aef-a809-6a3cf1e3eb12/b3000000-0000-4000-8000-000000000001.png";
async function withStorage(enabled: boolean, run: () => Promise<void>) {
  const child = spawn(process.execPath, ["scripts/test-storage.mjs"], {
    env: {
      ...process.env,
      TEST_STORAGE_PORT: "19009",
      BENCHMARK_IMAGES: String(enabled),
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Synthetic storage startup timed out")),
        5000,
      );
      const fail = () => {
        clearTimeout(timer);
        reject(new Error("Synthetic storage failed to start"));
      };
      child.once("error", fail);
      child.once("exit", fail);
      child.stdout.on("data", (data) => {
        if (String(data).includes("Synthetic S3 fixture")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    await run();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill();
      await exited;
    }
  }
}

it("returns missing images normally when benchmark mode is disabled", async () => {
  await withStorage(false, async () => {
    const response = await fetch(origin + key);
    expect(response.status).toBe(404);
    await response.arrayBuffer();
  });
});
it("serves complete benchmark image bytes and HEAD metadata only in benchmark mode", async () => {
  await withStorage(true, async () => {
    const response = await fetch(origin + key);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      benchmarkImages[0]!.bytes,
    );
    const head = await fetch(origin + key, { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe(
      String(benchmarkImages[0]!.bytes.length),
    );
    expect((await head.arrayBuffer()).byteLength).toBe(0);
    expect(
      (
        await fetch(
          origin + key.replace("browser-public-fixture", "browser-fixture"),
        )
      ).status,
    ).toBe(404);
  });
});
