#!/usr/bin/env tsx
import { recoverOwner } from "@/application/use-cases/staff/recover-owner";

async function main() {
  const args = process.argv.slice(2);
  let email = "";
  let baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

  for (const arg of args) {
    if (arg.startsWith("--email=")) {
      email = arg.replace(/^--email=/, "").trim();
    } else if (arg.startsWith("--baseUrl=")) {
      baseUrl = arg.replace(/^--baseUrl=/, "").trim();
    } else if (!arg.startsWith("--") && !email) {
      email = arg.trim();
    }
  }

  if (!email) {
    console.error("Error: Missing required email argument.");
    console.error("Usage: pnpm run auth:recover-owner --email=admin@example.com");
    process.exit(1);
  }

  try {
    const result = await recoverOwner({ email, baseUrl });

    console.log("=================================================");
    console.log("  OWNER ACCESS RECOVERY SUCCESSFUL (M5)");
    console.log("=================================================");
    console.log(`Target Email:   ${result.email}`);
    console.log(`User ID:        ${result.userId}`);
    console.log(`Role:           owner (active)`);
    console.log(`Expires At:     ${result.expiresAt.toISOString()}`);
    console.log("");
    console.log("Temporary One-Time Login URL (valid for 15 minutes):");
    console.log(result.recoveryUrl);
    console.log("=================================================");
    process.exit(0);
  } catch (error: any) {
    console.error("Owner recovery failed:", error.message || error);
    process.exit(1);
  }
}

main();
