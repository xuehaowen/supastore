import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export function startStorefront() {
  let settings = {};
  try {
    settings = parseEnv(
      readFileSync(new URL("../.env", import.meta.url), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/next/dist/bin/next", import.meta.url),
      ),
      "dev",
      "apps/storefront",
      "-p",
      process.env.STOREFRONT_PORT || "3001",
    ],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: {
        ...process.env,
        BACKEND_URL:
          process.env.BACKEND_URL ||
          settings.BACKEND_URL ||
          `http://127.0.0.1:${process.env.BACKEND_PORT || "3000"}`,
        STOREFRONT_ORIGIN:
          process.env.STOREFRONT_ORIGIN ||
          process.env.APP_URL ||
          `http://localhost:${process.env.STOREFRONT_PORT || "3001"}`,
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
  const child = startStorefront();
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => child.kill(signal));
}
