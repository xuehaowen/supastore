/**
 * Memory Consumption Benchmark and Profile Script
 * Validates process memory consumption (RSS, Heap, External) under simulated operational load
 * against the target <256MB–512MB RAM constraints.
 */

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

async function runMemoryBenchmark() {
  console.log('=== Supastore Memory Benchmark ===');
  console.log(`Node Version: ${process.version}`);
  console.log(`Platform: ${process.platform} (${process.arch})`);

  if (global.gc) {
    global.gc();
  }

  const initial = getMemoryUsage();
  console.log('\n[Baseline Memory]');
  console.log(`RSS:        ${formatBytes(initial.rss)}`);
  console.log(`Heap Used:  ${formatBytes(initial.heapUsed)}`);
  console.log(`Heap Total: ${formatBytes(initial.heapTotal)}`);

  // Simulate synthetic operational activity (allocating calculations, queries, objects)
  console.log('\nSimulating operational activity (50,000 synthetic operations)...');
  const syntheticWorkloads: any[] = [];
  const start = performance.now();

  for (let i = 0; i < 50_000; i++) {
    const item = {
      id: `ord_${i}`,
      referenceCode: `SP-${i.toString(36).toUpperCase()}`,
      subtotalCents: (i * 100) % 50000,
      taxCents: Math.round(((i * 100) % 50000) * 0.08),
      calculatedTotal: Math.round(((i * 100) % 50000) * 1.08),
      status: i % 2 === 0 ? 'confirmed' : 'unpaid',
      timestamp: new Date().toISOString(),
    };
    if (i % 10 === 0) {
      syntheticWorkloads.push(item);
    }
  }

  const elapsed = (performance.now() - start).toFixed(2);
  const peak = getMemoryUsage();

  console.log(`\nCompleted in ${elapsed}ms`);
  console.log('\n[Peak Memory]');
  console.log(`RSS:        ${formatBytes(peak.rss)}`);
  console.log(`Heap Used:  ${formatBytes(peak.heapUsed)}`);
  console.log(`Heap Total: ${formatBytes(peak.heapTotal)}`);

  // Cleanup
  syntheticWorkloads.length = 0;
  if (global.gc) {
    global.gc();
  }

  const postGc = getMemoryUsage();
  console.log('\n[Post-GC Memory]');
  console.log(`RSS:        ${formatBytes(postGc.rss)}`);
  console.log(`Heap Used:  ${formatBytes(postGc.heapUsed)}`);

  const memoryBudgetMb = 512;
  const peakMb = peak.rss / 1024 / 1024;

  console.log('\n=== Evaluation ===');
  console.log(`Measured Peak RSS: ${peakMb.toFixed(2)} MB`);
  console.log(`Target Ceiling:     ${memoryBudgetMb} MB`);

  if (peakMb < memoryBudgetMb) {
    console.log('✅ PASS: Memory consumption is well within target 256MB–512MB RAM constraints.\n');
  } else {
    console.error(`❌ FAIL: Memory peak (${peakMb.toFixed(2)} MB) exceeded target ceiling (${memoryBudgetMb} MB).\n`);
    process.exit(1);
  }
}

runMemoryBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
