import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { db, queryClient } from "@/infrastructure/db";
import { staffMemberships } from "@/infrastructure/db/schema";
import { getAdminOrderDetail } from "@/application/use-cases/orders/get-admin-order-detail";
import { ForbiddenError } from "@/application/common/errors";
import {
  checkDeployment,
  readDeploymentMigrationHistory,
} from "../../scripts/check-deployment.mjs";
import { securityHeaders } from "../../packages/config/security-headers.mjs";

const staffUserId = randomUUID();
beforeAll(async () => {
  await migrate(db, {
    migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
  });
  await db.insert(staffMemberships).values({
    userId: staffUserId,
    email: `readiness-${staffUserId}@example.test`,
    role: "staff",
    isActive: true,
  });
});
afterAll(async () => {
  await db
    .delete(staffMemberships)
    .where(eq(staffMemberships.userId, staffUserId));
  await queryClient.end();
});
it("compares actual PostgreSQL migration history without modifying the journal", async () => {
  const connection = process.env.DATABASE_URL!;
  const before = await readDeploymentMigrationHistory(connection);
  const report = await checkDeployment(
    {
      STOREFRONT_ORIGIN: "https://shop.example.test",
      BACKEND_URL: "http://backend:3000",
      EDGE_PROXY_SECRET: "readiness-fixture-secret-with-at-least-32-bytes",
      MIGRATION_DATABASE_URL: connection,
    },
    {
      connect: true,
      fetcher: async () =>
        new Response(null, {
          headers: Object.fromEntries(
            securityHeaders.map((header) => [header.key, header.value]),
          ),
        }),
    },
  );
  expect(report.passed).toBe(true);
  expect(before.length).toBe(
    readMigrationFiles({
      migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
    }).length,
  );
  expect(await readDeploymentMigrationHistory(connection)).toEqual(before);
});
it("authorizes staff before returning a missing order", async () => {
  await expect(
    getAdminOrderDetail({ staffUserId, orderId: randomUUID() }),
  ).resolves.toBeNull();
  await expect(
    getAdminOrderDetail({ staffUserId: randomUUID(), orderId: randomUUID() }),
  ).rejects.toBeInstanceOf(ForbiddenError);
});
it("rejects a deactivated staff member even with an existing identity", async () => {
  await db
    .update(staffMemberships)
    .set({ isActive: false })
    .where(eq(staffMemberships.userId, staffUserId));
  try {
    await expect(
      getAdminOrderDetail({ staffUserId, orderId: randomUUID() }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  } finally {
    await db
      .update(staffMemberships)
      .set({ isActive: true })
      .where(eq(staffMemberships.userId, staffUserId));
  }
});
