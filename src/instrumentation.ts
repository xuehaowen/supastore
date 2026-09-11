export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initGracefulShutdown, registerShutdownHandler } = await import(
      "./infrastructure/runtime/shutdown"
    );
    initGracefulShutdown();

    if (process.env.ENABLE_OUTBOX_WORKER === "true") {
      const { processOutboxBatch } = await import(
        "./infrastructure/worker/outbox"
      );
      const { smtpAdapter } = await import(
        "./infrastructure/notifications/smtp"
      );
      const { cleanupUploads } = await import(
        "./application/use-cases/uploads/cleanup-uploads"
      );
      const { runDailyHousekeeping } = await import(
        "./infrastructure/worker/housekeeping"
      );
      let busy = false;
      let batches = 0;
      const timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          await processOutboxBatch({ adapter: smtpAdapter });
          if (++batches % 12 === 0) await cleanupUploads();
          if (batches % 720 === 0) await runDailyHousekeeping(); // ~1 hour
        } catch {
          console.error("Outbox batch failed; retrying on next tick.");
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

