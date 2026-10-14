export interface WorkerJob {
  name: string;
  intervalMs: number;
  maxRunMs?: number;
  runImmediately?: boolean;
  run: () => Promise<unknown>;
}
interface JobProgress {
  running: boolean;
  nextDueAt: number;
  lastStartedAt: number | null;
  lastFinishedAt: number | null;
  lastSuccessAt: number | null;
  consecutiveFailures: number;
  maxRunMs: number;
}
interface WorkerState {
  enabled: boolean;
  lastTickAt: number | null;
  jobs: Record<string, JobProgress>;
}
declare global {
  var __supastoreWorkerState: WorkerState | undefined;
}
const state = () =>
  (globalThis.__supastoreWorkerState ??= {
    enabled: false,
    lastTickAt: null,
    jobs: {},
  });
export function resetWorkerState() {
  globalThis.__supastoreWorkerState = {
    enabled: false,
    lastTickAt: null,
    jobs: {},
  };
}
export function workerHealth(now = Date.now()) {
  const current = state();
  const jobs = Object.values(current.jobs);
  const stalled = jobs.some(
    (job) =>
      job.running &&
      job.lastStartedAt !== null &&
      now - job.lastStartedAt > job.maxRunMs,
  );
  const status = !current.enabled
    ? "disabled"
    : current.lastTickAt === null
      ? "starting"
      : stalled || now - current.lastTickAt > 60000
        ? "stalled"
        : jobs.some((job) => job.consecutiveFailures > 0)
          ? "degraded"
          : "ok";
  return {
    status,
    enabled: current.enabled,
    lastTickAt: current.lastTickAt,
    jobs: Object.fromEntries(
      Object.entries(current.jobs).map(([name, progress]) => [
        name,
        { ...progress },
      ]),
    ),
  };
}
export function createWorkerRunner(
  jobs: readonly WorkerJob[],
  options: {
    now?: () => number;
    onError: (name: string, error: unknown) => void;
  },
) {
  const clock = options.now ?? Date.now;
  resetWorkerState();
  const current = state();
  current.enabled = true;
  for (const job of jobs) {
    if (
      !Number.isFinite(job.intervalMs) ||
      job.intervalMs <= 0 ||
      current.jobs[job.name]
    )
      throw new Error("Invalid or duplicate worker schedule.");
    current.jobs[job.name] = {
      running: false,
      nextDueAt: clock() + (job.runImmediately === false ? job.intervalMs : 0),
      lastStartedAt: null,
      lastFinishedAt: null,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      maxRunMs: job.maxRunMs ?? 305000,
    };
  }
  return {
    async tick() {
      if (!current.enabled) return;
      const started = clock();
      current.lastTickAt = started;
      await Promise.all(
        jobs.map(async (job) => {
          const progress = current.jobs[job.name]!;
          if (progress.running || started < progress.nextDueAt) return;
          progress.running = true;
          progress.lastStartedAt = started;
          progress.nextDueAt = started + job.intervalMs;
          try {
            await job.run();
            progress.lastSuccessAt = clock();
            progress.consecutiveFailures = 0;
          } catch (error) {
            progress.consecutiveFailures++;
            progress.nextDueAt = clock() + Math.min(job.intervalMs, 60000);
            options.onError(job.name, error);
          } finally {
            progress.running = false;
            progress.lastFinishedAt = clock();
          }
        }),
      );
    },
    stop() {
      current.enabled = false;
    },
  };
}
