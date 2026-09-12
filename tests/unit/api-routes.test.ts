import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  redeemOwnerRecovery: vi.fn(),
  presignAsset: vi.fn(),
  orderToken: vi.fn(),
  createUploadIntent: vi.fn(),
  finalizeUpload: vi.fn(),
  db: { select: vi.fn() },
}));

vi.mock("@/application/use-cases/staff/redeem-owner-recovery", () => ({
  redeemOwnerRecovery: mocks.redeemOwnerRecovery,
}));
vi.mock("@/infrastructure/storage", () => ({
  presignAsset: mocks.presignAsset,
}));
vi.mock("@/infrastructure/web", () => ({ orderToken: mocks.orderToken }));
vi.mock("@/application/use-cases/uploads/create-upload-intent", () => ({
  createUploadIntent: mocks.createUploadIntent,
}));
vi.mock("@/application/use-cases/uploads/finalize-upload", () => ({
  finalizeUpload: mocks.finalizeUpload,
}));
vi.mock("@/infrastructure/db", () => ({ db: mocks.db }));

import { GET as redeem } from "@/app/api/auth/recover-owner/redeem/route";
import { GET as asset } from "@/app/api/assets/route";
import { POST as createEvidenceIntent, PATCH as finalizeEvidence } from "@/app/api/evidence/route";

function request(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init);
}

describe("API route boundaries", () => {
  it("redirects a valid owner recovery redemption and sets the session cookie", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    mocks.redeemOwnerRecovery.mockResolvedValueOnce({ sessionToken: "session-token", expiresAt });

    const response = await redeem(request("https://shop.test/api/auth/recover-owner/redeem?token=token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://shop.test/admin");
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=session-token");
  });

  it("redirects invalid owner recovery tokens to login without exposing a stack trace", async () => {
    mocks.redeemOwnerRecovery.mockRejectedValueOnce(new Error("expired token"));

    const response = await redeem(request("https://shop.test/api/auth/recover-owner/redeem?token=expired"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://shop.test/admin/login?error=expired+token",
    );
  });

  it("redirects published product assets and rejects unknown keys", async () => {
    const chain = (rows: unknown[]) => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => rows }) }),
        where: () => ({ limit: async () => rows }),
      }),
    });
    mocks.db.select
      .mockImplementationOnce(() => chain([{ key: "products/image.png" }]))
      .mockImplementationOnce(() => chain([]));
    mocks.presignAsset.mockResolvedValueOnce("https://storage.test/signed");

    const found = await asset(request("https://shop.test/api/assets?key=products%2Fimage.png"));
    expect(found.status).toBe(307);
    expect(found.headers.get("location")).toBe("https://storage.test/signed");

    mocks.db.select
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([]));
    const missing = await asset(request("https://shop.test/api/assets?key=missing.png"));
    expect(missing.status).toBe(404);
  });

  it("rejects evidence requests from another origin before touching storage", async () => {
    const response = await createEvidenceIntent(
      request("https://shop.test/api/evidence", {
        method: "POST",
        headers: { origin: "https://attacker.test", "content-type": "application/json" },
        body: JSON.stringify({ orderId: "00000000-0000-0000-0000-000000000000", mime: "image/png", size: 10 }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invalid origin" });
    expect(mocks.createUploadIntent).not.toHaveBeenCalled();
  });

  it("creates an evidence intent and finalizes it through the authenticated order token", async () => {
    mocks.orderToken.mockResolvedValue("order-session");
    mocks.createUploadIntent.mockResolvedValueOnce({ intentId: "intent-1" });
    mocks.finalizeUpload.mockResolvedValueOnce(undefined);
    const headers = { origin: "https://shop.test", "content-type": "application/json" };
    const orderId = "00000000-0000-0000-0000-000000000000";

    const created = await createEvidenceIntent(
      request("https://shop.test/api/evidence", {
        method: "POST",
        headers,
        body: JSON.stringify({ orderId, mime: "image/png", size: 10 }),
      }),
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toEqual({ intentId: "intent-1" });

    const finalized = await finalizeEvidence(
      request("https://shop.test/api/evidence", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ orderId, intentId: "00000000-0000-0000-0000-000000000001" }),
      }),
    );
    expect(finalized.status).toBe(200);
    expect(await finalized.json()).toEqual({ success: true });
    expect(mocks.finalizeUpload).toHaveBeenCalledWith({
      orderId,
      sessionToken: "order-session",
      intentId: "00000000-0000-0000-0000-000000000001",
    });
  });
});
