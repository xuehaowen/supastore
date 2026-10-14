import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  testIgnore:
    process.env.STOREFRONT_TESTS === "true"
      ? []
      : ["**/cross-service-sitemap.spec.ts", "**/cross-service-scale.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000, // Complete multi-step journeys, including cold route compilation.
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
