import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
const execute = promisify(execFile);

/** Async collection does not pause HTTP workers while PowerShell starts. */
export async function processMemory(pids, { privateMemory = false } = {}) {
  if (
    !Array.isArray(pids) ||
    !pids.length ||
    pids.some((pid) => !Number.isSafeInteger(pid) || pid < 1) ||
    new Set(pids).size !== pids.length
  )
    throw new Error("Invalid benchmark process identifiers");
  if (process.platform === "win32") {
    const { stdout } = await execute(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `@(Get-Process -Id @(${pids.join(",")}) -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64${privateMemory ? ",PrivateMemorySize64" : ""}) | ConvertTo-Json -Compress`,
      ],
      { windowsHide: true, timeout: 4000 },
    );
    const parsed = stdout.trim() ? JSON.parse(stdout) : [];
    const records = Array.isArray(parsed) ? parsed : [parsed];
    return records.map((row) => {
      if (
        !pids.includes(row.Id) ||
        !Number.isSafeInteger(row.WorkingSet64) ||
        row.WorkingSet64 <= 0
      )
        throw new Error("Invalid benchmark process memory");
      if (
        privateMemory &&
        (!Number.isSafeInteger(row.PrivateMemorySize64) ||
          row.PrivateMemorySize64 <= 0)
      )
        throw new Error("Invalid benchmark private memory");
      return {
        pid: row.Id,
        rssBytes: row.WorkingSet64,
        privateBytes: privateMemory ? row.PrivateMemorySize64 : undefined,
      };
    });
  }
  if (process.platform !== "linux")
    throw new Error("Benchmark memory supports Windows and Linux");
  const records = await Promise.all(
    pids.map(async (pid) => {
      try {
        const status = await readFile(`/proc/${pid}/status`, "utf8");
        const rssBytes = Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1]) * 1024;
        if (!Number.isSafeInteger(rssBytes) || rssBytes <= 0)
          throw new Error("Invalid benchmark process memory");
        return { pid, rssBytes, privateBytes: undefined };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    }),
  );
  return records.filter((record) => record !== null);
}
