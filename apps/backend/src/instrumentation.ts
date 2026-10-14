export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const {
      initGracefulShutdown,
      registerShutdownHandler,
      trackInFlight,
      isShuttingDown,
    } = await import("./infrastructure/runtime/shutdown");
    // Allow the bounded 30-second provider send to drain before closing its pool.
    initGracefulShutdown(35_000);
    registerShutdownHandler("notification-transports", async () => {
      const { closeNotificationProviders } =
        await import("./infrastructure/bootstrap/notification-providers");
      await closeNotificationProviders();
    });

    if (process.env.ENABLE_OUTBOX_WORKER === "true") {
      const { createWorkerRunner, workerHealth } =
        await import("./infrastructure/runtime/worker");
      if (workerHealth().enabled) return;
      const { logger } = await import("./infrastructure/security/logger");
      const { processOutboxBatch } =
        await import("./infrastructure/worker/outbox");
      const { getNotificationProviders } =
        await import("./infrastructure/bootstrap/notification-providers");
      const { processSmsBatch } = await import("./infrastructure/worker/sms");
      const { processNotificationInboxBatch } =
        await import("./application/notifications/notification-inbox");
      const providers = getNotificationProviders();
      const { cleanupUploads } =
        await import("./application/use-cases/uploads/cleanup-uploads");
      const { runDailyHousekeeping } =
        await import("./infrastructure/worker/housekeeping");
      const { reconcileStripeInbox } =
        await import("./application/use-cases/payments/stripe-checkout");
      const { checkSalesThreshold } =
        await import("./application/use-cases/reports/sales-report");
      const runner = createWorkerRunner(
        [
          {
            name: "email",
            intervalMs: 5000,
            run: () => processOutboxBatch({ providers }),
          },
          {
            name: "sms",
            intervalMs: 5000,
            run: () => processSmsBatch({ providers }),
          },
          {
            name: "callbacks",
            intervalMs: 5000,
            run: processNotificationInboxBatch,
          },
          ...(process.env.STRIPE_SECRET_KEY
            ? [
                {
                  name: "payments",
                  intervalMs: 60000,
                  run: reconcileStripeInbox,
                },
              ]
            : []),
          {
            name: "uploads",
            intervalMs: 60000,
            runImmediately: false,
            run: cleanupUploads,
          },
          {
            name: "housekeeping",
            intervalMs: 3600000,
            runImmediately: false,
            run: runDailyHousekeeping,
          },
          {
            name: "sales-threshold",
            intervalMs: 3600000,
            runImmediately: false,
            run: checkSalesThreshold,
          },
        ],
        {
          onError: (name, error) =>
            logger
              .child({ job: name })
              .error("Background job failed; scheduled for retry.", error),
        },
      );
      const timer = setInterval(async () => {
        if (isShuttingDown()) return;
        try {
          await trackInFlight(() => runner.tick());
        } catch (error) {
          logger.error("Background scheduler failed.", error);
        }
      }, 5000);
      timer.unref();

      registerShutdownHandler("outbox-worker", () => {
        runner.stop();
        clearInterval(timer);
      });
    }
  }
}
