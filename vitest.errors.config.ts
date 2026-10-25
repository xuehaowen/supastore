import { defineConfig } from "vitest/config";
import base from "./vitest.config";
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      "tests/unit/failure-contract.test.ts",
      "tests/unit/action-failure.test.ts",
      "tests/unit/auth-email-queue.test.ts",
      "tests/unit/commerce-api.test.ts",
      "tests/unit/evidence-upload-route.test.ts",
      "tests/unit/worker-runner.test.ts",
      "tests/unit/health.test.ts",
      "tests/unit/notification-provider-adapters.test.ts",
      "tests/unit/oauth-email.test.ts",
    ],
    coverage: {
      ...base.test?.coverage,
      include: [
        "apps/backend/src/infrastructure/http/failure.ts",
        "apps/backend/src/infrastructure/notifications/provider-errors.ts",
        "apps/backend/src/infrastructure/runtime/worker.ts",
      ],
      reportsDirectory: "./coverage/errors",
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
