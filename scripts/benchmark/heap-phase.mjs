import { writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

/** One owned runner writes; probes only read the atomically replaced marker. */
export function publishHeapPhase(directory, phase) {
  if (!["warmup", "measurement"].includes(phase))
    throw new Error("Invalid diagnostic phase");
  const temporary = join(directory, "heap-phase.tmp");
  writeFileSync(temporary, JSON.stringify({ phase }));
  renameSync(temporary, join(directory, "heap-phase.json"));
}
