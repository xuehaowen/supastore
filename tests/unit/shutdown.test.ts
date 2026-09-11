import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isShuttingDown,
  registerShutdownHandler,
  unregisterShutdownHandler,
  trackInFlight,
  waitForInFlight,
  executeGracefulShutdown,
  _resetShutdownStateForTesting,
} from '@/infrastructure/runtime/shutdown';

describe('Graceful Shutdown Manager', () => {
  beforeEach(() => {
    _resetShutdownStateForTesting();
  });

  it('tracks in-flight operations and drains them', async () => {
    expect(isShuttingDown()).toBe(false);

    let completed = false;
    const taskPromise = trackInFlight(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      completed = true;
      return 'done';
    });

    // In-flight operation is running
    const waitPromise = waitForInFlight(500, 10);
    const result = await taskPromise;
    const drained = await waitPromise;

    expect(result).toBe('done');
    expect(completed).toBe(true);
    expect(drained).toBe(true);
  });

  it('executes registered shutdown handlers in order upon signal', async () => {
    const handler1 = vi.fn().mockResolvedValue(undefined);
    const handler2 = vi.fn().mockResolvedValue(undefined);

    registerShutdownHandler('h1', handler1);
    registerShutdownHandler('h2', handler2);

    await executeGracefulShutdown('SIGTERM', 1000);

    expect(isShuttingDown()).toBe(true);
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('rejects new in-flight tasks when server is shutting down', async () => {
    await executeGracefulShutdown('SIGINT', 1000);
    expect(isShuttingDown()).toBe(true);

    await expect(
      trackInFlight(async () => 'should not run')
    ).rejects.toThrow('Server is shutting down');
  });

  it('unregisters handlers cleanly', async () => {
    const handler = vi.fn();
    registerShutdownHandler('test', handler);
    unregisterShutdownHandler('test');

    await executeGracefulShutdown('SIGTERM', 1000);
    expect(handler).not.toHaveBeenCalled();
  });
});
