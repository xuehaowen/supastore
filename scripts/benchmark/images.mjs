import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
function chunk(kind, bytes) {
  const data = Buffer.concat([Buffer.from(kind), bytes]);
  let crc = 0xffffffff;
  for (const value of data) crc = (crc >>> 8) ^ crcTable[(crc ^ value) & 255];
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length);
  data.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
function image(seed) {
  const width = 1200,
    height = 900;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Stable spatial texture: realistic payload size, no product/customer photos.
      let noise =
        Math.imul((x >>> 3) + seed, 374761393) ^
        Math.imul((y >>> 3) + seed, 668265263);
      noise = Math.imul(noise ^ (noise >>> 13), 1274126177) >>> 0;
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      pixels[offset] = 170 + (noise % 65);
      pixels[offset + 1] = 110 + ((noise >>> 8) % 90);
      pixels[offset + 2] = 70 + ((noise >>> 16) % 100);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const bytes = Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return {
    width,
    height,
    mime: "image/png",
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
// Two physical payloads, distinct immutable URLs for every product/image pair.
// The synthetic storage server shares buffers rather than retaining gigabytes.
export const benchmarkImages = [image(20261016), image(20261017)];
export function benchmarkImageForKey(key) {
  const match =
    /^\/browser-public-fixture\/catalog\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/b3000000-0000-4000-8000-00000000000([12])\.png$/.exec(
      key,
    );
  return match ? benchmarkImages[Number(match[1]) - 1] : undefined;
}
