import { appendFileSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { getHeapStatistics } from "node:v8";

/** Numeric runtime counters only: never retain request data or heap contents. */
export function captureHeapSample(mode, collect = globalThis.gc) {
  if (!["natural", "gc"].includes(mode))
    throw new Error("Invalid heap diagnostic");
  if (mode === "gc" && typeof collect !== "function")
    throw new Error("Explicit GC is unavailable");
  const snapshot = () => {
    const memory = process.memoryUsage();
    const heap = getHeapStatistics();
    return {
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      heapSizeLimitBytes: heap.heap_size_limit,
      heapPhysicalBytes: heap.total_physical_size,
      nativeContexts: heap.number_of_native_contexts,
      detachedContexts: heap.number_of_detached_contexts,
    };
  };
  const before = snapshot();
  if (mode === "gc") collect();
  return { forcedGc: mode === "gc", before, after: snapshot() };
}

export function diagnosticTarget(env) {
  const role = env.BENCHMARK_MEMORY_ROLE;
  const directory = env.BENCHMARK_REPORT_PATH ?? "";
  const database = basename(directory).replace(/^benchmark-/, "");
  if (
    !["backend", "storefront"].includes(role) ||
    !["natural", "gc"].includes(env.BENCHMARK_MEMORY_DIAGNOSTICS) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      env.BENCHMARK_OWNER_TOKEN ?? "",
    ) ||
    !/^supastore_cuj_\d{13}$/.test(database) ||
    directory !== resolve(".tmp-cuj", "benchmark-" + database) ||
    env.DATABASE_URL !==
      "postgresql://postgres:postgres@127.0.0.1:25449/" + database
  )
    throw new Error("Owned heap diagnostic required");
  // Refuse junction/symlink escapes before creating any output file.
  if (
    realpathSync(directory) !== directory ||
    realpathSync(resolve(".tmp-cuj")) !== resolve(".tmp-cuj")
  )
    throw new Error("Owned heap diagnostic required");
  return join(directory, role + "-heap.jsonl");
}

if (process.env.BENCHMARK_MEMORY_ROLE) {
  const output = diagnosticTarget(process.env);
  const sample = () => {
    let phase = "startup";
    try {
      const marker = JSON.parse(
        readFileSync(
          join(process.env.BENCHMARK_REPORT_PATH, "heap-phase.json"),
          "utf8",
        ),
      );
      if (!["warmup", "measurement"].includes(marker.phase))
        throw new Error("Invalid diagnostic phase");
      phase = marker.phase;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const mode =
      phase === "startup"
        ? "natural"
        : process.env.BENCHMARK_MEMORY_DIAGNOSTICS;
    const started = performance.now();
    appendFileSync(
      output,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        pid: process.pid,
        phase,
        uptimeSeconds: process.uptime(),
        mode,
        ...captureHeapSample(mode),
        probeDurationMs: performance.now() - started,
      }) + "\n",
    );
  };
  sample();
  setInterval(sample, 10000).unref();
}
