import { resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  launcherSettings,
  storefrontProcessEnvironment,
} from "./launcher-settings.mjs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export function startStorefront(command = "dev") {
  if (!["dev", "build", "start"].includes(command))
    throw new Error("Expected dev, build or start");
  const { publicOrigin, backendUrl } = launcherSettings(command);
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/next/dist/bin/next", import.meta.url),
      ),
      command,
      "apps/storefront",
      ...(command === "build"
        ? []
        : ["-p", process.env.STOREFRONT_PORT || "3001"]),
    ],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...storefrontProcessEnvironment(process.env),
        ...(command !== "dev" ? { NODE_ENV: "production" } : {}),
        BACKEND_URL: backendUrl,
        STOREFRONT_ORIGIN: publicOrigin,
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
  const child = startStorefront(process.argv[2]);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
}
