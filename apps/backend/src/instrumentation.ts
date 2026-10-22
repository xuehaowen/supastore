export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { initGracefulShutdown, registerShutdownHandler } =
    await import("./infrastructure/runtime/shutdown");
  initGracefulShutdown(35_000);
  registerShutdownHandler("notification-transports", async () => {
    const { closeNotificationProviders } =
      await import("./infrastructure/bootstrap/notification-providers");
    await closeNotificationProviders();
  });
  registerShutdownHandler("queue-producer", async () => {
    const { closeQueueProducer } =
      await import("./infrastructure/queue/client");
    await closeQueueProducer();
  });
}
