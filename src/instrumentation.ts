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
      let busy = false;
      let batches = 0;
      const timer = setInterval(async () => {
        if (busy || isShuttingDown()) return;
        busy = true;
        try {
          await trackInFlight(async () => {
            await processOutboxBatch({ providers });
            await processSmsBatch({ providers });
            await processNotificationInboxBatch();
            if (process.env.STRIPE_SECRET_KEY && batches % 12 === 0)
              await reconcileStripeInbox();
            if (++batches % 12 === 0) await cleanupUploads();
            if (batches % 720 === 0) {
              await runDailyHousekeeping(); // ~1 hour
              await checkSalesThreshold();
            }
          });
        } catch {
          logger.error("Outbox batch failed; retrying on next tick.");
        } finally {
          busy = false;
        }
      }, 5000);
      timer.unref();

      registerShutdownHandler("outbox-worker", () => {
        clearInterval(timer);
      });
    }
  }
}
