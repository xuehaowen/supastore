import { readFileSync, statSync } from "node:fs";
import { analyzeBenchmarkMemory } from "./memory-report";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1)
    throw new Error("Usage: pnpm bench:memory:analyze <memory.json>");
  const path = args[0]!;
  const file = statSync(path);
  if (!file.isFile() || file.size > 8 * 1024 * 1024)
    throw new Error("Memory artifact must be a JSON file of at most 8 MiB.");
  const report = analyzeBenchmarkMemory(JSON.parse(readFileSync(path, "utf8")));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "pass" ? 0 : 2;
} catch {
  // Input may contain sensitive/untrusted text; do not echo it or parser excerpts.
  console.error(
    "Cannot analyze memory artifact. Use: pnpm bench:memory:analyze <memory.json>; supply protocol-v1 measurement samples (JSON, at most 8 MiB).",
  );
  process.exitCode = 1;
}
