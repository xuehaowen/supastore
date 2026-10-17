import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { publishHeapPhase } from "../../scripts/benchmark/heap-phase.mjs";

it("publishes complete phase markers while another process continuously reads", async () => {
  const directory = mkdtempSync(join(resolve(".tmp-cuj/platform-quality"), "phase-test-"));
  const marker = join(directory, "heap-phase.json");
  const done = join(directory, "done");
  let child;
  try {
    publishHeapPhase(directory, "warmup");
    expect(JSON.parse(readFileSync(marker, "utf8"))).toEqual({ phase: "warmup" });
    const source = `import { readFileSync, existsSync } from 'node:fs';
      process.stdout.write('ready\\n');
      let reads = 0;
      const deadline = Date.now() + 5000;
      while (!existsSync(${JSON.stringify(done)}) && Date.now() < deadline) {
        const phase = JSON.parse(readFileSync(${JSON.stringify(marker)}, 'utf8')).phase;
        if (phase !== 'warmup' && phase !== 'measurement') throw Error('Incomplete phase');
        reads++;
      }
      console.log(JSON.stringify({ reads }));`;
    child = spawn(process.execPath, ["--input-type=module", "-e", source], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const exited = new Promise<void>((resolve, reject) => {
      child!.once("error", reject);
      child!.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Concurrent reader failed")));
    });
    await new Promise<void>((resolve, reject) => {
      child!.once("error", reject);
      child!.stdout!.on("data", (chunk) => { output += String(chunk); if (output.includes("ready\n")) resolve(); });
    });
    for (let i = 0; i < 500; i++) publishHeapPhase(directory, i % 2 ? "warmup" : "measurement");
    writeFileSync(done, "done");
    await exited;
    expect(JSON.parse(output.trim().split("\n").at(-1)!).reads).toBeGreaterThan(0);
    expect(() => publishHeapPhase(directory, "invalid")).toThrow("Invalid diagnostic phase");
  } finally {
    child?.kill();
    for (const file of [marker, done, join(directory, "heap-phase.tmp")]) if (existsSync(file)) unlinkSync(file);
    rmdirSync(directory);
  }
}, 10000);
