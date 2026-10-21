import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as uploadImage } from "@/app/api/catalog-images/route";
import { POST as importCsv } from "@/app/api/admin/imports/products/route";

const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  session: vi.fn(),
  upload: vi.fn(),
  importCsv: vi.fn(),
  verifyStaff: vi.fn(),
}));
vi.mock("@/infrastructure/web", () => ({ staffIdentity: mocks.staff }));
vi.mock("@/infrastructure/auth", () => ({
  staffAuth: { api: { getSession: mocks.session } },
}));
vi.mock("@/infrastructure/auth/session", () => ({
  verifyStaffInTransaction: mocks.verifyStaff,
}));
vi.mock("@/infrastructure/db", () => ({
  db: { transaction: async (work: (tx: object) => unknown) => work({}) },
}));
vi.mock("@/application/use-cases/catalog/upload-catalog-image", () => ({
  uploadCatalogImage: mocks.upload,
}));
vi.mock("@/application/use-cases/catalog/import-products-csv", () => ({
  parseProductCsv: () => ({ rows: [], errors: [] }),
  importProductsCsv: mocks.importCsv,
}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["APP_URL", "STOREFRONT_ORIGIN", "BETTER_AUTH_URL"])
    vi.stubEnv(key, undefined);
  vi.stubEnv("NODE_ENV", "production");
  mocks.staff.mockResolvedValue("staff");
  mocks.session.mockResolvedValue({ user: { id: "staff" } });
  mocks.upload.mockResolvedValue(undefined);
  mocks.importCsv.mockResolvedValue({ imported: 1 });
});
afterEach(() => vi.unstubAllEnvs());

for (const [path, handler] of [
  ["/api/catalog-images", uploadImage],
  ["/api/admin/imports/products", importCsv],
] as const) {
  it(`${path} stops chunked multipart input at the request byte limit`, async () => {
    vi.stubEnv("STOREFRONT_ORIGIN", "https://shop.example.test");
    let pulled = 0;
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        pulled++;
        if (pulled === 1)
          controller.enqueue(
            new TextEncoder().encode(
              '--fixture\r\nContent-Disposition: form-data; name="file"; filename="large.png"\r\nContent-Type: image/png\r\n\r\n',
            ),
          );
        else if (pulled <= 21) controller.enqueue(new Uint8Array(1024 * 1024));
        else {
          controller.enqueue(new TextEncoder().encode("\r\n--fixture--\r\n"));
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    });
    const response = await handler(
      new NextRequest(`http://backend:3000${path}`, {
        method: "POST",
        headers: {
          origin: "https://shop.example.test",
          "content-type": "multipart/form-data; boundary=fixture",
        },
        body,
        duplex: "half",
      } as RequestInit),
    );
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.importCsv).not.toHaveBeenCalled();
  });
}

for (const [path, handler] of [
  ["/api/catalog-images", uploadImage],
  ["/api/admin/imports/products", importCsv],
] as const) {
  it.each(["APP_URL", "STOREFRONT_ORIGIN", "BETTER_AUTH_URL"])(
    `${path} accepts proxied uploads with only %s configured`,
    async (key) => {
      vi.stubEnv(key, "https://shop.example.test/");
      const body = new FormData();
      body.set(
        "file",
        new File(["synthetic"], "fixture.png", { type: "image/png" }),
      );
      body.set("entityType", "product");
      body.set("entityId", "product");
      const response = await handler(
        new NextRequest(`http://backend:3000${path}`, {
          method: "POST",
          headers: { origin: "https://shop.example.test" },
          body,
        }),
      );
      expect(response.status).toBe(200);
      expect(
        path === "/api/catalog-images" ? mocks.upload : mocks.importCsv,
      ).toHaveBeenCalledOnce();
    },
  );
  it.each(["missing", "foreign", "cross-site"])(
    `${path} rejects %s origins before authentication or body consumption`,
    async (kind) => {
      vi.stubEnv("STOREFRONT_ORIGIN", "https://shop.example.test/");
      const request = new NextRequest(`http://backend:3000${path}`, {
        method: "POST",
        body: "unread",
        headers:
          kind === "missing"
            ? {}
            : {
                origin:
                  kind === "foreign"
                    ? "https://attacker.example"
                    : "https://shop.example.test",
                ...(kind === "cross-site"
                  ? { "sec-fetch-site": "cross-site" }
                  : {}),
              },
      });
      expect((await handler(request)).status).toBe(403);
      expect(request.bodyUsed).toBe(false);
      expect(mocks.staff).not.toHaveBeenCalled();
      expect(mocks.session).not.toHaveBeenCalled();
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.importCsv).not.toHaveBeenCalled();
    },
  );
}
