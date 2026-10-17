import { readFileSync, writeFileSync } from "node:fs";
import { validateRaceEvidence } from "./race-evidence";
const path = process.env.BENCHMARK_REPORT_PATH;
if (!path) throw new Error("Owned benchmark report directory required");
const result = validateRaceEvidence(
  JSON.parse(readFileSync(path + "/races-vitest.json", "utf8")),
);
writeFileSync(path + "/races.json", JSON.stringify(result, null, 2));
