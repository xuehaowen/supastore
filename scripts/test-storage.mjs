// In-memory S3 protocol fixture for isolated M1 browser tests; never use in deployment.
import http from "node:http";
const objects = new Map();
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "PUT,GET,HEAD,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,x-amz-checksum-crc32,x-amz-sdk-checksum-algorithm",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  const key = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (req.method === "PUT") {
    const source = req.headers["x-amz-copy-source"];
    if (source) {
      const object = objects.get(
        "/" + decodeURIComponent(String(source)).replace(/^\//, ""),
      );
      if (!object) {
        res.writeHead(404).end();
        return;
      }
      objects.set(key, { ...object, bytes: Buffer.from(object.bytes) });
      res.setHeader("Content-Type", "application/xml");
      res.end(
        '<CopyObjectResult><ETag>"fixture"</ETag><LastModified>' +
          new Date().toISOString() +
          "</LastModified></CopyObjectResult>",
      );
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    objects.set(key, {
      bytes: Buffer.concat(chunks),
      mime: req.headers["content-type"] ?? "application/octet-stream",
    });
    res.setHeader("ETag", '"fixture"');
    res.writeHead(200).end();
    return;
  }
  if (req.method === "DELETE") {
    objects.delete(key);
    res.writeHead(204).end();
    return;
  }
  const object = objects.get(key);
  if (!object) {
    res.writeHead(404).end();
    return;
  }
  const bytes = req.headers.range
    ? object.bytes.subarray(0, 2048)
    : object.bytes;
  res.setHeader("Content-Type", object.mime);
  res.setHeader("Content-Length", bytes.length);
  res.writeHead(req.headers.range ? 206 : 200);
  res.end(req.method === "HEAD" ? undefined : bytes);
});
server.listen(9000, "127.0.0.1", () =>
  console.log("Synthetic S3 fixture on localhost:9000"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit()));
