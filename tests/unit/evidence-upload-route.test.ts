import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/application/common/errors";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  access: vi.fn(),
  token: vi.fn(),
  put: vi.fn(),
}));
vi.mock("@/infrastructure/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("@/application/common/guest-access", () => ({
  verifyOrderAccess: mocks.access,
}));
vi.mock("@/infrastructure/web", () => ({ orderToken: mocks.token }));
vi.mock("@/infrastructure/storage", () => ({ putUpload: mocks.put }));
import { PUT } from "@/app/api/evidence/upload/route";
const id = "00000000-0000-0000-0000-000000000001";
let intent: Record<string, unknown>;
beforeEach(() => {
  vi.resetAllMocks();
  intent = {
    status: "pending",
    expiresAt: new Date(Date.now() + 60000),
    declaredMimeType: "image/png",
    declaredSizeBytes: 3,
    s3Key: "private/staging",
  };
  mocks.token.mockResolvedValue("session");
  mocks.transaction.mockImplementation(async (work) =>
    work({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [intent] }) }),
      }),
    }),
  );
});
function request(
  body: BodyInit = "png",
  headers: Record<string, string> = {},
  query = `orderId=${id}&intentId=${id}`,
) {
  return new NextRequest(`http://shop.test/api/evidence/upload?${query}`, {
    method: "PUT",
    headers: {
      origin: "http://shop.test",
      "content-type": "image/png",
      ...headers,
    },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  } as ConstructorParameters<typeof NextRequest>[1]);
}
describe("evidence upload boundary", () => {
  it("uploads only the authenticated pending intent", async () => {
    expect((await PUT(request())).status).toBe(200);
    expect(mocks.access).toHaveBeenCalledWith(
      expect.any(Object),
      id,
      "session",
    );
    expect(mocks.put).toHaveBeenCalledWith(
      "private/staging",
      "image/png",
      new Uint8Array(Buffer.from("png")),
    );
  });
  it("rejects a foreign origin without reading or uploading", async () => {
    const req = request("png", { origin: "http://attacker.test" });
    expect((await PUT(req)).status).toBe(403);
    expect(req.bodyUsed).toBe(false);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it.each(["expired", "finalized", "changed size", "changed mime"])(
    "rejects %s intents",
    async (variant) => {
      if (variant === "expired") intent.expiresAt = new Date(0);
      if (variant === "finalized") intent.status = "finalized";
      if (variant === "changed size") intent.declaredSizeBytes = 4;
      if (variant === "changed mime") intent.declaredMimeType = "image/jpeg";
      expect((await PUT(request())).status).toBe(400);
      expect(mocks.put).not.toHaveBeenCalled();
    },
  );
  it("rejects unauthorized order access", async () => {
    mocks.access.mockRejectedValueOnce(new UnauthorizedError());
    expect((await PUT(request())).status).toBe(401);
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it.each(["", "orderId=bad&intentId=bad"])(
    "rejects malformed identifiers %s before persistence",
    async (query) => {
      expect((await PUT(request("png", {}, query))).status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );
  it("does not expose unexpected storage errors", async () => {
    mocks.put.mockRejectedValueOnce(
      new Error("private endpoint and credentials"),
    );
    const response = await PUT(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Upload failed. Please try again.",
    });
  });
  it("rejects unsupported MIME before consuming the body", async () => {
    const req = request("png", { "content-type": "text/html" });
    expect((await PUT(req)).status).toBe(400);
    expect(req.bodyUsed).toBe(false);
  });
  it("rejects oversized content-length without consuming the body", async () => {
    const req = request("png", { "content-length": String(5 * 1024 * 1024) });
    expect((await PUT(req)).status).toBe(400);
    expect(req.bodyUsed).toBe(false);
  });
  it("stops reading an oversized chunked stream", async () => {
    let pulls = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1024 * 1024));
        if (pulls === 20) controller.close();
      },
    });
    expect((await PUT(request(body))).status).toBe(400);
    expect(pulls).toBeLessThan(10);
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
