import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
export function measureFixtureResources(services) {
  return services.map(({ service, pid }) => {
    if (
      !Number.isSafeInteger(pid) ||
      pid < 1 ||
      !["backend", "storefront"].includes(service)
    )
      throw new Error("Invalid fixture process");
    let rssBytes, peakRssBytes;
    if (process.platform === "win32") {
      const record = JSON.parse(
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Get-Process -Id ${pid} | Select-Object WorkingSet64,PeakWorkingSet64 | ConvertTo-Json -Compress`,
          ],
          { encoding: "utf8", windowsHide: true, timeout: 5000 },
        ),
      );
      rssBytes = record.WorkingSet64;
      peakRssBytes = record.PeakWorkingSet64;
    } else if (process.platform === "linux") {
      const status = readFileSync(`/proc/${pid}/status`, "utf8");
      rssBytes = Number(/^VmRSS:\s+(\d+)/m.exec(status)?.[1]) * 1024;
      peakRssBytes = Number(/^VmHWM:\s+(\d+)/m.exec(status)?.[1]) * 1024;
    } else
      throw new Error("Fixture RSS measurement supports Windows and Linux");
    if (
      ![rssBytes, peakRssBytes].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      )
    )
      throw new Error("Fixture RSS unavailable");
    return { service, pid, rssBytes, peakRssBytes };
  });
}
