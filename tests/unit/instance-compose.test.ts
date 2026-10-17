import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";

const compose = load(readFileSync("docker-compose.yml", "utf8")) as { services: Record<string, { container_name?: string; ports?: string[]; healthcheck?: { test: string[] } }> };
it("names database and storage containers per Compose project", () => {
  for (const service of ["postgres", "rustfs"]) {
    expect(compose.services[service]!.container_name).toContain("${COMPOSE_PROJECT_NAME");
  }
});
it("allows each instance to choose its loopback-only dependency ports", () => {
  for (const [service, variable, fallback, internal] of [["postgres", "POSTGRES_PORT", "5432", "5432"], ["rustfs", "S3_API_PORT", "9000", "9000"], ["rustfs", "S3_CONSOLE_PORT", "9001", "9001"], ["adminer", "ADMINER_PORT", "9002", "8080"]]) {
    expect(compose.services[service!]!.ports).toContain(`127.0.0.1:\${${variable}:-${fallback}}:${internal}`);
  }
});
it("checks readiness against the instance's configured database and user", () => {
  const command = compose.services.postgres!.healthcheck!.test.join(" ");
  expect(command).toContain("$${POSTGRES_USER}");
  expect(command).toContain("$${POSTGRES_DB}");
});
