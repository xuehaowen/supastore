import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { launcherSettings } from "./launcher-settings.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
export function startBackend(command = "dev") {
  if (!["dev", "build", "start"].includes(command))
    throw new Error("Expected dev, build or start");
  const publicOrigin =
    command === "build" ? undefined : launcherSettings(command).publicOrigin;
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/next/dist/bin/next", import.meta.url),
      ),
      command,
      "apps/backend",
      ...(command === "build"
        ? []
        : ["-p", process.env.BACKEND_PORT || "3000"]),
    ],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        ...(command !== "dev" ? { NODE_ENV: "production" } : {}),
        ...(command !== "build"
          ? {
              APP_URL: process.env.APP_URL || publicOrigin,
              STOREFRONT_ORIGIN: process.env.STOREFRONT_ORIGIN || publicOrigin,
              BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || publicOrigin,
            }
          : {}),
        SERVICE_ROLE: "backend",
      },
    },
  );
  child.once("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.once("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  return child;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const child = startBackend(process.argv[2]);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
}
