import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@supastore/contracts";

/** Database and auth configuration are validated by their owning modules. */
export function demoSeedPassword(env: Record<string, string | undefined>) {
  if (env.M1_DEMO !== "true" && env.DEMO_SEED !== "true")
    throw new Error(
      "Set DEMO_SEED=true (or M1_DEMO=true) only against an isolated synthetic demo database.",
    );
  const password = env.DEMO_OWNER_PASSWORD ?? "AdminSetupSecret123!";
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  )
    throw new Error(
      `DEMO_OWNER_PASSWORD must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    );
  return password;
}
