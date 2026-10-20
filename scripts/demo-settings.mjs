import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const demoProject = "supastore-demo";
const secretKeys = [
  "DEMO_DB_PASSWORD",
  "DEMO_APP_PASSWORD",
  "DEMO_AUTH_SECRET",
  "DEMO_SETUP_SECRET",
  "DEMO_STORAGE_USER",
  "DEMO_STORAGE_PASSWORD",
];

export function createDemoSettings() {
  return {
    DEMO_KIND: "isolated-local-v1",
    DEMO_PROJECT: `supastore-demo-${randomBytes(6).toString("hex")}`,
    DEMO_PORT: "3080",
    DEMO_STORAGE_PORT: "3090",
    ...Object.fromEntries(
      secretKeys.map((key) => [key, randomBytes(32).toString("hex")]),
    ),
  };
}
export function validateDemoSettings(settings) {
  if (settings.DEMO_KIND !== "isolated-local-v1")
    throw new Error("Not an owned Supastore demo configuration.");
  // Older demos used a fixed project name; keep their existing volumes reachable.
  if (
    settings.DEMO_PROJECT !== undefined &&
    !/^supastore-demo-[a-f0-9]{12}$/.test(settings.DEMO_PROJECT)
  )
    throw new Error("Invalid isolated demo project.");
  for (const key of secretKeys)
    if (!/^[a-f0-9]{64}$/.test(settings[key] ?? ""))
      throw new Error(`Invalid demo setting: ${key}.`);
  for (const key of ["DEMO_PORT", "DEMO_STORAGE_PORT"])
    if (
      !/^\d+$/.test(settings[key] ?? "") ||
      Number(settings[key]) < 1024 ||
      Number(settings[key]) > 65535
    )
      throw new Error(`Invalid demo port: ${key}.`);
  if (settings.DEMO_PORT === settings.DEMO_STORAGE_PORT)
    throw new Error("Demo ports must differ.");
  const allowed = new Set([
    "DEMO_KIND",
    "DEMO_PROJECT",
    "DEMO_PORT",
    "DEMO_STORAGE_PORT",
    ...secretKeys,
  ]);
  if (Object.keys(settings).some((key) => !allowed.has(key)))
    throw new Error(
      "Unexpected demo setting; application credentials are not accepted here.",
    );
  return settings;
}
export function initializeDemoSettings(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "settings.env");
  if (!existsSync(file)) {
    const settings = createDemoSettings();
    writeFileSync(
      file,
      "# Local synthetic demo only. Never commit or reuse these credentials.\n" +
        Object.entries(settings)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n") +
        "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  const entries = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      if (index < 1) throw new Error("Invalid demo configuration line.");
      return [line.slice(0, index), line.slice(index + 1)];
    });
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new Error("Duplicate demo settings.");
  return { file, settings: validateDemoSettings(Object.fromEntries(entries)) };
}
