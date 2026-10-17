import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { cpus, totalmem, platform, release } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";
import { parseBenchmarkOptions } from "./options.mjs";
import { assertFixtureTarget } from "./fixture-target";
import { verifyFixtureOwnership } from "./seed";
import { benchmarkProtocol } from "./protocol";
import { analyzeBenchmarkMemory } from "./memory-report";
import { processMemory } from "./process-memory.mjs";
import { LoadMetrics, shoppingCycle, type BenchmarkRequest } from "./http-load";

const parsedOptions = parseBenchmarkOptions(process.argv.slice(2));
if (
  !parsedOptions ||
  process.env.APP_URL !== "http://localhost:3103" ||
  process.env.BACKEND_URL !== "http://127.0.0.1:3102"
)
  throw new Error("Owned local benchmark runner required");
const options = parsedOptions;
const connection = process.env.DATABASE_URL ?? "";
const token = process.env.BENCHMARK_OWNER_TOKEN ?? "";
assertFixtureTarget(connection, token);
const output = process.env.BENCHMARK_REPORT_PATH;
if (!output) throw new Error("Benchmark report directory required");
const appPids = [
  Number(process.env.BENCHMARK_BACKEND_PID),
  Number(process.env.BENCHMARK_STOREFRONT_PID),
];
const postmasterPid = Number(process.env.BENCHMARK_POSTGRES_PID);
if (
  [...appPids, postmasterPid].some(
    (pid) => !Number.isSafeInteger(pid) || pid < 1,
  )
)
  throw new Error("Owned benchmark process identifiers required");
const client = postgres(connection, { max: 2, onnotice: () => {} });
let fatal: string | null = null;
const failures: { operation: string; status: number | null }[] = [];
try {
  await client.begin((tx) => verifyFixtureOwnership(tx, connection, token));
  const variants = await client<
    { id: string; handle: string; price_cents: number }[]
  >`select v.id,p.handle,v.price_cents from product_variants v join products p on p.id=v.product_id order by p.handle,v.sort_order`;
  if (variants.length !== options.products * 4)
    throw new Error("Benchmark fixture size mismatch");
  const [bank] =
    await client`select id from payment_accounts where is_active and account_type='other'`;
  const [location] = await client`select id from pickup_location`;
  if (!bank || (options.fulfillment !== "shipping" && !location))
    throw new Error("Benchmark fixture fulfillment mismatch");
  const [before] = await client`select count(*)::int as orders from orders`;
  const metadata = {
    protocolVersion: benchmarkProtocol.version,
    workers: benchmarkProtocol.workers,
    requestMix: benchmarkProtocol.requestMix,
    options,
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
    sourceTreeDirty: Boolean(
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
        windowsHide: true,
      }).trim(),
    ),
    host: {
      platform: platform(),
      release: release(),
      cpuModel: cpus()[0]?.model,
      logicalCpus: cpus().length,
      ramBytes: totalmem(),
    },
    nodeVersion: process.version,
    nextVersion: JSON.parse(
      readFileSync("node_modules/next/package.json", "utf8"),
    ).version,
    runtime: process.env.BENCHMARK_RUNTIME_MODE,
    network: "local loopback, no latency shaping",
    browser: "none; HTTP document load only",
    initialJs: JSON.parse(
      execFileSync(
        process.execPath,
        ["scripts/measure-storefront-bundle.mjs"],
        {
          encoding: "utf8",
          windowsHide: true,
          env: {
            ...process.env,
            STOREFRONT_DIST_DIR: process.env.NEXT_DIST_DIR ?? "",
          },
        },
      ),
    ),
    startedAt: new Date().toISOString(),
    latency:
      "complete response body; successful-response quantiles rounded up to 1ms; timeout 15s",
    bytes:
      "decoded response bodies; excludes headers, browser JS, images and RSC navigation",
    throughput:
      "requests admitted during phase divided by phase seconds; their responses may complete in drainSeconds; achieved operation shares include partial cycles",
    postgresMemory:
      "gross sum of postmaster and pg_stat_activity process RSS; shared pages counted repeatedly; not container memory or PSS",
    resourceLimits: benchmarkProtocol.resourceLimits,
  };
  writeFileSync(output + "/manifest.json", JSON.stringify(metadata, null, 2));
  const memory: Record<
    "backend" | "storefront" | "postgres",
    { elapsedSeconds: number; rssBytes: number }[]
  > = { backend: [], storefront: [], postgres: [] };
  let successfulOrders = 0;
  async function phase(name: "warmup" | "measurement", seconds: number) {
    const metrics = new LoadMetrics();
    const started = performance.now();
    const deadline = started + seconds * 1000;
    let workersDone = false;
    const active = () => fatal === null && performance.now() < deadline;
    const sampler = async () => {
      let sampleIndex = 0;
      while (!workersDone && active()) {
        const elapsedSeconds = (performance.now() - started) / 1000;
        const pgRows = await client<
          { pid: number }[]
        >`select pid from pg_stat_activity`;
        const pgPids = [
          ...new Set([postmasterPid, ...pgRows.map((row) => row.pid)]),
        ];
        const records = await processMemory([
          ...new Set([...appPids, ...pgPids]),
        ]);
        const rss = (pid: number) =>
          records.find((row) => row.pid === pid)?.rssBytes;
        const backend = rss(appPids[0]!),
          storefront = rss(appPids[1]!);
        const postgresRss = records
          .filter((row) => pgPids.includes(row.pid))
          .reduce((sum, row) => sum + row.rssBytes, 0);
        if (!backend || !storefront || !postgresRss)
          throw new Error("Benchmark service memory unavailable");
        const record = {
          phase: name,
          elapsedSeconds,
          backend,
          storefront,
          postgres: postgresRss,
          databaseProcessCount: pgPids.length,
        };
        appendFileSync(output + "/memory.jsonl", JSON.stringify(record) + "\n");
        if (name === "measurement")
          for (const service of ["backend", "storefront", "postgres"] as const)
            memory[service].push({ elapsedSeconds, rssBytes: record[service] });
        if (sampleIndex % 12 === 0)
          console.log(
            JSON.stringify({
              phase: name,
              elapsedSeconds: Math.round(elapsedSeconds),
              requests: metrics.report(Math.max(elapsedSeconds, 0.001))
                .requests,
            }),
          );
        sampleIndex++;
        await delay(
          Math.max(
            0,
            Math.min(deadline, started + sampleIndex * 5000) -
              performance.now(),
          ),
        );
      }
    };
    const sampling = sampler().catch(() => {
      fatal = "Benchmark memory collection failed";
    });
    const workers = Array.from(
      { length: benchmarkProtocol.workers },
      async (_, worker) => {
        let cycle = 0;
        const request: BenchmarkRequest = async (
          operation,
          path,
          method,
          body,
          cookie,
        ) => {
          const t0 = performance.now();
          let status: number | null = null,
            bytes = 0;
          try {
            const response = await fetch("http://localhost:3103" + path, {
              method,
              redirect: "error",
              signal: AbortSignal.timeout(15000),
              headers: {
                Origin: "http://localhost:3103",
                "Content-Type": "application/json",
                "Accept-Encoding": "identity",
                Cookie: cookie,
                "x-supastore-edge-token": process.env.EDGE_PROXY_SECRET ?? "",
                "x-supastore-client-ip": `198.18.0.${worker + 1}`,
              },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            status = response.status;
            const text = await response.text();
            bytes = Buffer.byteLength(text);
            if (!response.ok)
              throw new Error("Unexpected benchmark HTTP response");
            const data: unknown =
              method === "GET"
                ? null
                : (JSON.parse(text) as { data: unknown }).data;
            const cartCookie = response.headers
              .getSetCookie()
              .find((value) => value.startsWith("shop-cart="))
              ?.split(";")[0];
            metrics.record(operation, performance.now() - t0, status, bytes);
            if (operation === "order") successfulOrders++;
            return { data, ...(cartCookie ? { cartCookie } : {}) };
          } catch {
            metrics.record(
              operation,
              performance.now() - t0,
              status === 200 ? null : status,
              bytes,
            );
            if (failures.length < 20) failures.push({ operation, status });
            throw new Error("Benchmark HTTP request failed");
          }
        };
        try {
          while (active()) {
            const variant =
              variants[(worker * 97 + cycle * 31) % variants.length]!;
            const fulfillment =
              options.fulfillment === "mixed"
                ? (worker + cycle) % 2
                  ? "shipping"
                  : "pickup"
                : options.fulfillment;
            await shoppingCycle(
              {
                variantId: variant.id,
                handle: variant.handle,
                priceCents: variant.price_cents,
                paymentAccountId: bank!.id,
                pickupLocationId: location?.id ?? "",
                fulfillment,
              },
              request,
              active,
            );
            cycle++;
          }
        } catch (error) {
          fatal =
            error instanceof Error ? error.message : "Benchmark worker failed";
        }
      },
    );
    await Promise.all(workers);
    workersDone = true;
    await sampling;
    const elapsed = (performance.now() - started) / 1000;
    return {
      ...metrics.report(fatal ? Math.max(elapsed, 0.001) : seconds),
      drainSeconds: Math.max(0, elapsed - seconds),
    };
  }
  const warmup = await phase("warmup", options.warmupSeconds);
  const measurement = fatal
    ? null
    : await phase("measurement", options.measurementSeconds);
  const [after] = await client`select count(*)::int as orders from orders`;
  const [invariants] = await client`select
    (select count(*)::int from orders o where purchase_total_cents <> (select coalesce(sum(line_total_cents),0) from order_items i where i.order_id=o.id)) as amount_mismatches,
    (select count(*)::int from variant_stock s where reserved<>coalesce((select sum(quantity-consumed_quantity) from stock_reservations r where r.variant_id=s.variant_id and r.status='active'),0) or on_hand<reserved or on_hand<>coalesce((select sum(delta) from stock_movements m where m.variant_id=s.variant_id),0)) as stock_mismatches,
    (select count(*)::int from orders o join carts c on c.id=o.source_cart_id where c.converted_order_id is distinct from o.id) as cart_mismatches`;
  const orderCountMatches = after!.orders - before!.orders === successfulOrders;
  const workloadCovered = Boolean(
    measurement &&
    Object.values(measurement.operations).every(
      (operation) => operation.successes > 0,
    ),
  );
  const checksPass =
    workloadCovered &&
    orderCountMatches &&
    Object.values(invariants!).every((value) => value === 0);
  const report = {
    scope: "representative-http-load",
    protocolVersion: benchmarkProtocol.version,
    mode: options.mode,
    status:
      fatal || !checksPass
        ? "fail"
        : options.mode === "smoke"
          ? "diagnostic-pass"
          : "http-pass",
    benchmarkAcceptance: "pending-browser-races-and-resource-calibration",
    fatal,
    failures,
    warmup,
    measurement,
    invariants,
    orderCountMatches,
    successfulOrders,
    workloadCovered,
    memoryAcceptance: analyzeBenchmarkMemory({
      protocolVersion: benchmarkProtocol.version,
      phase: "measurement",
      services: memory,
    }),
  };
  writeFileSync(
    output + "/memory.json",
    JSON.stringify(
      {
        protocolVersion: benchmarkProtocol.version,
        phase: "measurement",
        services: memory,
      },
      null,
      2,
    ),
  );
  writeFileSync(output + "/http-load.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      report: output + "/http-load.json",
      status: report.status,
      unexpectedFailures: measurement?.unexpectedFailures,
      successfulOrders,
    }),
  );
  if (report.status === "fail") process.exitCode = 1;
} finally {
  await client.end();
}
