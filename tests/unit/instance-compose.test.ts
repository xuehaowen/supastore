import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";

const compose = load(readFileSync("docker-compose.yml", "utf8")) as {
  services: Record<
    string,
    {
      container_name?: string;
      image?: string;
      ports?: string[];
      environment?: string[];
      healthcheck?: { test: string[] };
    }
  >;
};
it("names database and storage containers per Compose project", () => {
  for (const service of ["postgres", "rustfs"]) {
    expect(compose.services[service]!.container_name).toContain(
      "${COMPOSE_PROJECT_NAME",
    );
  }
});
it("lets each instance select all release images without changing default application tags", () => {
  expect(compose.services.backend!.image).toBe(
    "${BACKEND_IMAGE:-supastore-backend:latest}",
  );
  expect(compose.services.storefront!.image).toBe(
    "${STOREFRONT_IMAGE:-supastore-storefront:latest}",
  );
  expect(compose.services.migrate!.image).toBe(
    "${MIGRATION_IMAGE:-${COMPOSE_PROJECT_NAME:-supastore}-migrate:latest}",
  );
});
it("allows each instance to choose its loopback-only dependency ports", () => {
  for (const [service, variable, fallback, internal] of [
    ["postgres", "POSTGRES_PORT", "5432", "5432"],
    ["rustfs", "S3_API_PORT", "9000", "9000"],
    ["rustfs", "S3_CONSOLE_PORT", "9001", "9001"],
  ]) {
    expect(compose.services[service!]!.ports).toContain(
      `127.0.0.1:\${${variable}:-${fallback}}:${internal}`,
    );
  }
});
it("checks readiness against the instance's configured database and user", () => {
  const command = compose.services.postgres!.healthcheck!.test.join(" ");
  expect(command).toContain("$${POSTGRES_USER}");
  expect(command).toContain("$${POSTGRES_DB}");
});
it.each([
  "docker-compose.yml",
  "scripts/compose.demo.yml",
  "scripts/compose.smoke.yml",
])("initializes new PostgreSQL volumes with Unicode defaults in %s", (file) => {
  const configuration = load(readFileSync(file, "utf8")) as {
    services: { postgres: { environment: Record<string, string> } };
  };
  expect(configuration.services.postgres.environment.POSTGRES_INITDB_ARGS).toBe(
    "--encoding=UTF8 --locale-provider=builtin --builtin-locale=PG_UNICODE_FAST",
  );
});
it("passes recovery delivery-suppression and worker settings into the actual backend", () => {
  expect(compose.services.backend!.environment).toContain(
    "ENABLE_OUTBOX_WORKER=${ENABLE_OUTBOX_WORKER:-true}",
  );
  expect(compose.services.backend!.environment).toContain(
    "DISABLE_OUTBOUND_DELIVERY=${DISABLE_OUTBOUND_DELIVERY:-false}",
  );
});
it("passes explicit SMS modes and defaults live authorization to false", () => {
  const env = compose.services.backend!.environment;
  expect(env).toContain("SMS_PROVIDER=${SMS_PROVIDER:-disabled}");
  expect(env).toContain("SMS_LIVE_AUTHORIZED=${SMS_LIVE_AUTHORIZED:-false}");
  expect(env).toContain(
    "PHONE_VERIFICATION_PROVIDER=${PHONE_VERIFICATION_PROVIDER:-disabled}",
  );
});
it("requires an explicit public origin for both production services", () => {
  for (const name of ["backend", "storefront"]) {
    const env = compose.services[name]!.environment;
    const serialized = JSON.stringify(env);
    expect(serialized).toContain("STOREFRONT_ORIGIN:?");
    expect(serialized).not.toContain("localhost:3000");
  }
});
