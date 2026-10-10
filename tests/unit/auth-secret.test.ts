import { describe, expect, it } from "vitest";
import { authSecretFromEnvironment } from "@/infrastructure/auth/secret";

describe("production auth secret", () => {
  it.each([
    undefined,
    "",
    "short",
    "change-me-to-a-secure-random-auth-secret-min-32-chars",
    "build-only-placeholder-secret-at-least-32-characters",
  ])("rejects missing or placeholder secrets", (secret) => {
    expect(() =>
      authSecretFromEnvironment({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: secret,
      }),
    ).toThrow("BETTER_AUTH_SECRET");
  });
  it("accepts a configured production secret", () => {
    const secret = "SyntheticProductionSecret123456789!";
    expect(
      authSecretFromEnvironment({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: secret,
      }),
    ).toBe(secret);
  });
  it("retains development defaults", () => {
    expect(
      authSecretFromEnvironment({ NODE_ENV: "development" }),
    ).toBeUndefined();
  });
});
