import { expect, it } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import {
  publishHeapPhase,
  readHeapPhase,
} from "../../scripts/benchmark/heap-phase.mjs";

it("publishes monotonic phases while another process continuously reads", async () => {
  const directory = mkdtempSync(join(tmpdir(), "supastore-heap-phase-"));
  const done = join(directory, "done");
  let child;
  let exited: Promise<number | null> | undefined;
  try {
    expect(readHeapPhase(directory)).toBe("startup");
    publishHeapPhase(directory, "warmup");
    expect(readHeapPhase(directory)).toBe("warmup");
    const moduleUrl = pathToFileURL(
      resolve("scripts/benchmark/heap-phase.mjs"),
    ).href;
    const source = `import { existsSync } from 'node:fs';
      import { readHeapPhase } from ${JSON.stringify(moduleUrl)};
      process.stdout.write('ready\\n');
      let reads = 0, measured = false;
      const deadline = Date.now() + 5000;
      while (!existsSync(${JSON.stringify(done)}) && Date.now() < deadline) {
        const phase = readHeapPhase(${JSON.stringify(directory)});
        if (phase !== 'warmup' && phase !== 'measurement') throw Error('Incomplete phase');
        if (measured && phase !== 'measurement') throw Error('Phase moved backward');
        measured ||= phase === 'measurement'; reads++;
      }
      console.log(JSON.stringify({ reads }));`;
    child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    exited = new Promise<number | null>((resolve) => {
      child!.once("error", () => resolve(-1));
      child!.once("exit", resolve);
    });
    await new Promise<void>((resolve, reject) => {
      child!.once("error", reject);
      child!.stdout!.on("data", (chunk: Buffer) => {
        output += String(chunk);
        if (output.includes("ready\n")) resolve();
      });
    });
    for (let i = 0; i < 500; i++)
      publishHeapPhase(directory, i < 250 ? "warmup" : "measurement");
    writeFileSync(done, "done");
    expect(await exited).toBe(0);
    expect(JSON.parse(output.trim().split("\n").at(-1)!).reads).toBeGreaterThan(
      0,
    );
    expect(readHeapPhase(directory)).toBe("measurement");
    expect(() => publishHeapPhase(directory, "invalid")).toThrow(
      "Invalid diagnostic phase",
    );
  } finally {
    child?.kill();
    await exited;
    if (existsSync(done)) unlinkSync(done);
    for (const phase of ["warmup", "measurement"]) {
      const marker = join(directory, "heap-phase-" + phase);
      if (existsSync(marker)) rmdirSync(marker);
    }
    rmdirSync(directory);
  }
}, 10000);
