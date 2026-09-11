/**
 * Graceful process termination and lifecycle management (SIGTERM / SIGINT).
 * Ensures in-flight operations complete (up to 15s timeout) and worker leases are drained.
 */

type ShutdownCallback = () => Promise<void> | void;

interface ShutdownState {
  isShuttingDown: boolean;
  inFlightCount: number;
  handlers: Map<string, ShutdownCallback>;
  registeredSignals: boolean;
}

const state: ShutdownState = {
  isShuttingDown: false,
  inFlightCount: 0,
  handlers: new Map(),
  registeredSignals: false,
};

export function isShuttingDown(): boolean {
  return state.isShuttingDown;
}

export function registerShutdownHandler(name: string, handler: ShutdownCallback): void {
  state.handlers.set(name, handler);
}

export function unregisterShutdownHandler(name: string): void {
  state.handlers.delete(name);
}

/**
 * Tracks an in-flight async operation so graceful shutdown can wait for it to complete.
 */
export async function trackInFlight<T>(operation: () => Promise<T>): Promise<T> {
  if (state.isShuttingDown) {
    throw new Error('Server is shutting down; refusing new operations.');
  }

  state.inFlightCount++;
  try {
    return await operation();
  } finally {
    state.inFlightCount = Math.max(0, state.inFlightCount - 1);
  }
}

/**
 * Waits for all in-flight operations to finish, or times out after timeoutMs.
 */
export async function waitForInFlight(timeoutMs = 15_000, checkIntervalMs = 100): Promise<boolean> {
  const start = Date.now();
  while (state.inFlightCount > 0) {
    if (Date.now() - start >= timeoutMs) {
      return false; // Timed out
    }
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }
  return true;
}

/**
 * Executes registered shutdown hooks and awaits in-flight draining.
 */
export async function executeGracefulShutdown(signal: string, timeoutMs = 15_000): Promise<void> {
  if (state.isShuttingDown) return;
  state.isShuttingDown = true;

  console.info(`Received ${signal}. Initiating graceful shutdown (timeout: ${timeoutMs}ms)...`);

  // Wait for in-flight tasks
  const drained = await waitForInFlight(timeoutMs);
  if (!drained) {
    console.warn(`Graceful shutdown: timed out waiting for ${state.inFlightCount} in-flight operations.`);
  } else {
    console.info('Graceful shutdown: all in-flight operations drained successfully.');
  }

  // Execute shutdown handlers
  for (const [name, handler] of state.handlers.entries()) {
    try {
      await handler();
      console.info(`Graceful shutdown: handler '${name}' completed.`);
    } catch (err) {
      console.error(`Graceful shutdown: handler '${name}' failed:`, err);
    }
  }
}

/**
 * Registers OS signal listeners for SIGTERM and SIGINT in Node.js runtime.
 */
export function initGracefulShutdown(timeoutMs = 15_000): void {
  if (typeof process === 'undefined' || !process.on || state.registeredSignals) {
    return;
  }

  state.registeredSignals = true;

  const handleSignal = async (signal: string) => {
    try {
      await executeGracefulShutdown(signal, timeoutMs);
      process.exit(0);
    } catch (err) {
      console.error(`Fatal error during graceful shutdown on ${signal}:`, err);
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void handleSignal('SIGTERM'));
  process.once('SIGINT', () => void handleSignal('SIGINT'));
}

/**
 * Reset state for testing purposes only.
 */
export function _resetShutdownStateForTesting(): void {
  state.isShuttingDown = false;
  state.inFlightCount = 0;
  state.handlers.clear();
}
