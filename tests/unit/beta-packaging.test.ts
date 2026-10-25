import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { load } from "js-yaml";
import {
  createDemoSettings,
  initializeDemoSettings,
  validateDemoSettings,
} from "../../scripts/demo-settings.mjs";
import { betaRelease } from "../../scripts/release-settings.mjs";

it("generates separate demo secrets and rejects production settings and unsafe ports", () => {
  const settings = createDemoSettings();
  expect(validateDemoSettings(settings)).toEqual(settings);
  expect(createDemoSettings().DEMO_PROJECT).not.toBe(settings.DEMO_PROJECT);
  expect(() =>
    validateDemoSettings({ ...settings, DEMO_PROJECT: "production" }),
  ).toThrow("project");
  const { DEMO_PROJECT: _project, ...legacy } = settings;
  expect(validateDemoSettings(legacy)).toEqual(legacy);
  const secrets = Object.entries(settings)
    .filter(([key]) => /PASSWORD|SECRET|STORAGE_USER/.test(key))
    .map(([, value]) => value);
  expect(new Set(secrets).size).toBe(secrets.length);
  expect(() =>
    validateDemoSettings({
      ...settings,
      DATABASE_URL: "postgresql://production",
    }),
  ).toThrow("Unexpected");
  expect(() => validateDemoSettings({ ...settings, DEMO_PORT: "0" })).toThrow(
    "port",
  );
  expect(() =>
    validateDemoSettings({
      ...settings,
      DEMO_PORT: settings.DEMO_STORAGE_PORT,
    }),
  ).toThrow("differ");
});
it("preserves existing demo configuration and rejects duplicates without rewriting it", () => {
  const dir = mkdtempSync(join(tmpdir(), "supastore-demo-test-"));
  try {
    const initial = initializeDemoSettings(dir);
    expect(initializeDemoSettings(dir).settings).toEqual(initial.settings);
    const invalid = readFileSync(initial.file, "utf8") + "DEMO_PORT=4000\n";
    writeFileSync(initial.file, invalid);
    expect(() => initializeDemoSettings(dir)).toThrow("Duplicate");
    expect(readFileSync(initial.file, "utf8")).toBe(invalid);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("isolates demo ports, providers, database names and secrets from the configured store", () => {
  const compose = load(readFileSync("scripts/compose.demo.yml", "utf8")) as {
    services: Record<
      string,
      {
        environment?: Record<string, string>;
        ports?: string[];
        env_file?: unknown;
      }
    >;
  };
  for (const service of Object.values(compose.services)) {
    expect(service.env_file).toBeUndefined();
    for (const port of service.ports ?? [])
      expect(port).toMatch(/^127\.0\.0\.1:/);
  }
  for (const name of ["backend", "demo-tools"]) {
    const env = compose.services[name]!.environment!;
    expect(env.DISABLE_OUTBOUND_DELIVERY).toBe("true");
    expect(env.ENABLE_OUTBOX_WORKER).toBe("false");
    expect(env.SMS_PROVIDER).toBe("disabled");
    expect(env.EMAIL_PROVIDER).toBe("disabled");
    expect(env.DATABASE_URL).toContain("/supastore_demo");
  }
  expect(readFileSync(".dockerignore", "utf8")).toContain(".supastore-demo");
  expect(readFileSync(".gitignore", "utf8")).toContain(".supastore-demo/");
});
it("accepts only explicit developer-beta versions and safe image namespaces", () => {
  expect(betaRelease("Xuehaowen/Supastore", "v0.1.0-beta.1")).toEqual({
    tag: "v0.1.0-beta.1",
    namespace: "ghcr.io/xuehaowen/supastore",
  });
  for (const tag of [
    "latest",
    "v1.0.0",
    "v0.1.0",
    "v0.1.0-beta.0",
    "v0.1.0-beta.1\nBAD=true",
  ])
    expect(() => betaRelease("xuehaowen/supastore", tag)).toThrow("beta");
  expect(() => betaRelease("owner/repo; echo bad", "v0.1.0-beta.1")).toThrow(
    "repository",
  );
});

it("checks the actual tag and exact-commit CI before executing candidate scripts or publishing", () => {
  const workflow = load(
    readFileSync(".github/workflows/release.yml", "utf8"),
  ) as {
    on: Record<string, unknown>;
    jobs: {
      publish: {
        env: Record<string, string>;
        steps: {
          id?: string;
          name?: string;
          run?: string;
          env?: Record<string, string>;
        }[];
      };
    };
  };
  expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  const job = workflow.jobs.publish;
  expect(job.env.GH_TOKEN).toBeUndefined();
  const gate = job.steps.findIndex((step) => step.id === "candidate");
  const candidateCode = job.steps.findIndex((step) => step.id === "release");
  expect(gate).toBeGreaterThan(0);
  expect(gate).toBeLessThan(candidateCode);
  expect(job.steps[gate]!.run).toContain("refs/tags/$RELEASE_TAG^{commit}");
  expect(job.steps[gate]!.run).toContain(
    'git merge-base --is-ancestor "$sha" origin/main',
  );
  expect(job.steps[gate]!.run).toContain("head_sha=$sha&status=success");
  const build = job.steps.find((step) => step.name?.startsWith("Build all"))!;
  expect(build.env?.GH_TOKEN).toBeUndefined();
  expect(build.run).not.toContain("docker push");
});
