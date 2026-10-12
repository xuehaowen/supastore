import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();

// Load .env and .env.local if present
for (const envFile of [".env", ".env.local"]) {
  const fullPath = resolve(cwd, envFile);
  if (existsSync(fullPath)) {
    process.loadEnvFile(fullPath);
  }
}
