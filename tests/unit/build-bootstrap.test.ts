import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fixtureDirectory } from "../../scripts/fixture-directory.mjs";

it.each(["build:backend", "build:storefront"])(
  "%s loads production configuration before the launcher",
  (command) => {
    const fixture = fixtureDirectory("browser");
    try {
      const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
        scripts: Record<string, string>;
      };
      const flags = pkg.scripts[command]!.split(" ").filter((arg) =>
        arg.startsWith("--env-file"),
      );
      writeFileSync(
        join(fixture.path, ".env"),
        "BACKEND_URL=http://base:3000\nNEXT_PUBLIC_ANALYTICS_ENDPOINT=https://base.example.test\n",
      );
      writeFileSync(
        join(fixture.path, ".env.production"),
        "BACKEND_URL=http://production:3000\nNEXT_PUBLIC_ANALYTICS_ENDPOINT=https://production.example.test\n",
      );
      writeFileSync(
        join(fixture.path, ".env.local"),
        "BACKEND_URL=http://local:3000\n",
      );
      writeFileSync(
        join(fixture.path, ".env.production.local"),
        "BACKEND_URL=http://final:3000\n",
      );
      const result = spawnSync(
        process.execPath,
        [
          ...flags,
          "-e",
          "console.log(JSON.stringify([process.env.BACKEND_URL,process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT]))",
        ],
        {
          cwd: fixture.path,
          encoding: "utf8",
          windowsHide: true,
          env: Object.fromEntries(
            Object.entries(process.env).filter(
              ([key]) =>
                !["BACKEND_URL", "NEXT_PUBLIC_ANALYTICS_ENDPOINT"].includes(
                  key,
                ),
            ),
          ),
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout.trim())).toEqual([
        "http://final:3000",
        "https://production.example.test",
      ]);
    } finally {
      fixture.cleanup();
    }
  },
);
