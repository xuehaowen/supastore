import { expect, it } from "vitest";
import {
  readUploadForm,
  UploadTooLargeError,
} from "@/infrastructure/http/bounded-multipart";

const multipart =
  '--fixture\r\nContent-Disposition: form-data; name="name"\r\n\r\nvalue\r\n--fixture--\r\n';
function request(body: string, length?: string) {
  return new Request("http://localhost/upload", {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=fixture",
      ...(length === undefined ? {} : { "content-length": length }),
    },
    body,
  });
}
it("accepts valid multipart at the exact byte boundary", async () => {
  const form = await readUploadForm(
    request(multipart),
    Buffer.byteLength(multipart),
  );
  expect(form.get("name")).toBe("value");
});
it("bounds actual bytes even when Content-Length understates them", async () => {
  await expect(
    readUploadForm(request(multipart, "1"), 10),
  ).rejects.toBeInstanceOf(UploadTooLargeError);
});
it.each(["999999999", "invalid", "-1"])(
  "rejects an invalid or excessive declared length %s",
  async (length) => {
    await expect(
      readUploadForm(request(multipart, length), 1024),
    ).rejects.toBeInstanceOf(UploadTooLargeError);
  },
);
it("rejects malformed multipart inside the byte boundary", async () => {
  await expect(readUploadForm(request("malformed"))).rejects.toThrow();
});
