import assert from "node:assert/strict";
import { spawn } from "node:child_process";
const origin = process.env.SMOKE_ORIGIN || "http://127.0.0.1:3097";
assert.match(origin, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
const duration = Number(process.env.LOAD_DURATION_SECONDS || 120);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 8);
assert.ok(Number.isInteger(duration) && duration >= 10 && duration <= 3600);
assert.ok(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 32);
const routes = ["/api/v1/catalog", "/api/v1/catalog?search=Fixture", "/api/v1/store", "/api/v1/products/fixture-product", "/en"];
const results = Object.fromEntries(routes.map(route => [route, { count: 0, failures: 0, latency: [] }]));
const started = performance.now();
async function snapshot() {
  const containers = process.env.LOAD_CONTAINER_METRICS === "true" ? await new Promise(resolve => {
    const child = spawn("docker", ["stats", "--no-stream", "--format", "{{.Name}} CPU={{.CPUPerc}} memory={{.MemUsage}}", "supastore-codex-smoke-backend-1", "supastore-codex-smoke-storefront-1", "supastore-codex-smoke-postgres-1"], { windowsHide: true });
    const timeout = setTimeout(() => child.kill(), 10000);
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timeout); resolve("metrics unavailable"); });
    child.on("exit", code => { clearTimeout(timeout); resolve(code === 0 ? output.trim() : "metrics unavailable"); });
  }) : undefined;
  console.log(JSON.stringify({ elapsedSeconds: Math.round((performance.now() - started) / 1000), requests: Object.values(results).reduce((sum, result) => sum + result.count, 0), failures: Object.values(results).reduce((sum, result) => sum + result.failures, 0), containers }));
}
const progress = setInterval(snapshot, 60000);
await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
  let iteration = worker;
  while (performance.now() - started < duration * 1000) {
    const route = routes[iteration++ % routes.length];
    const result = results[route];
    const before = performance.now();
    try {
      const response = await fetch(origin + route, { signal: AbortSignal.timeout(15000) });
      await response.arrayBuffer();
      if (!response.ok) {
        result.failures++;
        if (result.failures <= 5) console.log(JSON.stringify({ failure: true, route, status: response.status }));
      }
    } catch (error) {
      result.failures++;
      if (result.failures <= 5) console.log(JSON.stringify({ failure: true, route, error: error instanceof Error ? error.name : "RequestError", code: error?.cause?.code }));
    }
    result.count++;
    result.latency.push(performance.now() - before);
  }
}));
clearInterval(progress);
await snapshot();
const summary = Object.fromEntries(Object.entries(results).map(([route, result]) => {
  result.latency.sort((a, b) => a - b);
  const percentile = value => Math.round(result.latency[Math.min(result.latency.length - 1, Math.floor(result.latency.length * value))] || 0);
  return [route, { requests: result.count, failures: result.failures, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99) }];
}));
console.log(JSON.stringify({ origin, durationSeconds: duration, concurrency, readOnly: true, routes: summary }, null, 2));
assert.equal(Object.values(results).reduce((sum, result) => sum + result.failures, 0), 0, "Local load requests must succeed");
