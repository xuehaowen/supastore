import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertFixtureTarget } from "./fixture-target";
import { fixtureProfile } from "./protocol";
import { seedRepresentativeFixture, verifyFixtureOwnership } from "./seed";

export async function prepareRepresentativeFixture(
  connection: string,
  token: string,
  profile: ReturnType<typeof fixtureProfile>,
) {
  assertFixtureTarget(connection, token);
  fixtureProfile(
    profile.products,
    profile.fulfillment,
    profile.rewards,
    profile.trackedStock,
  );
  const client = postgres(connection, { max: 1, onnotice: () => {} });
  try {
    await client.begin((tx) => verifyFixtureOwnership(tx, connection, token));
    await migrate(drizzle(client), {
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    });
  } finally {
    await client.end();
  }
  return seedRepresentativeFixture(connection, token, profile);
}
