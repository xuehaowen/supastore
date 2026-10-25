import { expect, it } from "vitest";
import { demoSeedPassword } from "../../scripts/demo-seed-config";

it("accepts demo configuration without unrelated application setup settings", () => {
  expect(
    demoSeedPassword({
      DEMO_SEED: "true",
      DEMO_OWNER_PASSWORD: "SyntheticDemoPassword123!",
    }),
  ).toBe("SyntheticDemoPassword123!");
  expect(demoSeedPassword({ M1_DEMO: "true" })).toBe("AdminSetupSecret123!");
});

it("requires explicit demo opt-in", () => {
  expect(() => demoSeedPassword({})).toThrow("Set DEMO_SEED=true");
});

it.each(["short", "a".repeat(129)])(
  "rejects an unsupported demo owner password",
  (password) => {
    expect(() =>
      demoSeedPassword({ DEMO_SEED: "true", DEMO_OWNER_PASSWORD: password }),
    ).toThrow("DEMO_OWNER_PASSWORD must be between");
  },
);
