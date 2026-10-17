// Parse before the fixture directory, database or any server is created.
export function parseBenchmarkOptions(args) {
  if (!args.includes("--benchmark")) return null;
  const accepted =
    /^(--benchmark|--smoke|--measure|--standalone|--production|--diagnose-memory=(natural|gc|compact)|--runtime-memory=(default|compact)|--products=(100|1000|10000)|--fulfillment=(shipping|pickup|mixed)|--rewards=(on|off)|--stock=(tracked|untracked))$/;
  const names = args.map((arg) => arg.split("=")[0]);
  if (
    args.some((arg) => !accepted.test(arg)) ||
    new Set(names).size !== names.length
  )
    throw new Error("Invalid benchmark options");
  const option = (name, fallback) =>
    args.find((arg) => arg.startsWith(name + "="))?.split("=")[1] ?? fallback;
  const products = Number(option("--products", "1000"));
  const fulfillment = option("--fulfillment", "mixed");
  const rewards = option("--rewards", "on") === "on";
  const trackedStock = option("--stock", "tracked") === "tracked";
  const smoke = args.includes("--smoke");
  const diagnostics = option("--diagnose-memory", "none");
  const runtimeMemory = option("--runtime-memory", "default");
  if (runtimeMemory === "compact" && diagnostics !== "none")
    throw new Error("Invalid benchmark options");
  if (smoke && diagnostics !== "none")
    throw new Error("Invalid benchmark options");
  return Object.freeze({
    products,
    fulfillment,
    rewards,
    trackedStock,
    diagnostics,
    runtimeMemory,
    mode:
      diagnostics !== "none"
        ? "heap-diagnostic"
        : smoke
          ? "smoke"
          : products === 1000 &&
              fulfillment === "mixed" &&
              rewards &&
              trackedStock
            ? "standard"
            : "profile-diagnostic",
    warmupSeconds: diagnostics !== "none" ? 30 : smoke ? 5 : 300,
    measurementSeconds: diagnostics !== "none" ? 120 : smoke ? 30 : 1800,
  });
}
