import { parseProductCsv } from "@/domain/catalog/product-csv";
self.addEventListener("message", (event: MessageEvent<{ type: string; csvText: string }>) => {
  if (event.data.type === "parse") {
    try {
      const result = parseProductCsv(event.data.csvText);
      self.postMessage({ type: "result", ...result });
    } catch (err) {
      self.postMessage({
        type: "error",
        message: err instanceof Error ? err.message : "Parse error",
      });
    }
  }
});
