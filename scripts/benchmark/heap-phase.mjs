import { mkdirSync, existsSync, lstatSync } from "node:fs";
import { join } from "node:path";

/** Phases advance once. Directory creation is atomic and never replaces a read file. */
export function publishHeapPhase(directory, phase) {
  if (!["warmup", "measurement"].includes(phase))
    throw new Error("Invalid diagnostic phase");
  const marker = join(directory, "heap-phase-" + phase);
  try {
    mkdirSync(marker);
  } catch (error) {
    if (
      error.code !== "EEXIST" ||
      !lstatSync(marker).isDirectory() ||
      lstatSync(marker).isSymbolicLink()
    )
      throw error;
  }
}
export function readHeapPhase(directory) {
  if (existsSync(join(directory, "heap-phase-measurement")))
    return "measurement";
  if (existsSync(join(directory, "heap-phase-warmup"))) return "warmup";
  return "startup";
}
