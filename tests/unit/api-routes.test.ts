import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/application/common/errors";
import { createHmac } from "node:crypto";

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
vi.mock("@/infrastructure/auth", () => ({
  staffAuth: {
    $context: Promise.resolve({
      secret: "SyntheticRecoveryCookieSecret123456789!",
      authCookies: {
        sessionToken: {
          name: "__Secure-supastore-staff.session_token",
          attributes: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
          },
        },
        sessionData: {
          name: "__Secure-supastore-staff.session_data",
          attributes: {
            httpOnly: true,
            secure: true,
            sameSite: "lax",
            path: "/",
          },
        },
      },
    }),
  },
}));

import { GET as redeem } from "@/app/api/auth/recover-owner/redeem/route";
import { GET as asset } from "@/app/api/assets/route";
import {
  POST as createEvidenceIntent,
  PATCH as finalizeEvidence,
} from "@/app/api/evidence/route";

function request(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(url, init);
}

describe("API route boundaries", () => {
  it("serves bounded image bytes only for published assets", async () => {
    const chain = (rows: unknown[]) => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => rows }) }),
        where: () => ({ limit: async () => rows }),
      }),
    });
    const fetchImage = vi.fn();
    vi.stubGlobal("fetch", fetchImage);
    try {
      for (const rows of [[{ key: "image.png" }], [], []])
        mocks.db.select.mockImplementationOnce(() => chain(rows));
      mocks.presignAsset.mockResolvedValueOnce("https://storage.test/image");
      fetchImage.mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        }),
      );
      const response = await asset(
        request("https://shop.test/api/assets?key=image.png&inline=1"),
      );
      expect(response.status).toBe(200);
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      for (const rows of [[], [], []])
        mocks.db.select.mockImplementationOnce(() => chain(rows));
      expect(
        (
          await asset(
            request("https://shop.test/api/assets?key=private.png&inline=1"),
          )
        ).status,
      ).toBe(404);
      expect(fetchImage).toHaveBeenCalledTimes(1);
      for (const rows of [[{ key: "image.png" }], [], []])
        mocks.db.select.mockImplementationOnce(() => chain(rows));
      mocks.presignAsset.mockResolvedValueOnce("https://storage.test/image");
      fetchImage.mockResolvedValueOnce(
        new Response(new Uint8Array(5 * 1024 * 1024 + 1), {
          headers: { "content-type": "image/png" },
        }),
      );
      expect(
        (
          await asset(
            request("https://shop.test/api/assets?key=image.png&inline=1"),
          )
        ).status,
      ).toBe(502);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("redirects a valid owner recovery redemption and sets the session cookie", async () => {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z");
    mocks.redeemOwnerRecovery.mockResolvedValueOnce({
      sessionToken: "session-token",
      expiresAt,
    });

    const response = await redeem(
      request("https://shop.test/api/auth/recover-owner/redeem?token=token", {
        headers: {
          cookie: "__Secure-supastore-staff.session_data.0=stale-cache",
        },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://shop.test/admin");
    const signed = response.cookies.get(
      "__Secure-supastore-staff.session_token",
    )!;
    const expectedSignature = createHmac(
      "sha256",
      "SyntheticRecoveryCookieSecret123456789!",
    )
      .update("session-token")
      .digest("base64");
    expect(signed.value).toBe(`session-token.${expectedSignature}`);
    expect(signed).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      expires: expiresAt,
    });
    expect(
      response.cookies.get("supastore-staff.session_token"),
    ).toBeUndefined();
    expect(
      response.cookies.get("__Secure-supastore-staff.session_data.0")?.maxAge,
    ).toBe(0);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects invalid owner recovery tokens to login without exposing a stack trace", async () => {
    mocks.redeemOwnerRecovery.mockRejectedValueOnce(
      new UnauthorizedError("expired token"),
    );

    const response = await redeem(
      request("https://shop.test/api/auth/recover-owner/redeem?token=expired"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://shop.test/admin/login?error=expired+token",
    );
  });

  it("does not expose unexpected recovery errors", async () => {
    mocks.redeemOwnerRecovery.mockRejectedValueOnce(
      new Error("private database details"),
    );
    const response = await redeem(
      request("https://shop.test/api/auth/recover-owner/redeem?token=token"),
    );
    expect(response.headers.get("location")).toBe(
      "https://shop.test/admin/login?error=Failed+to+redeem+recovery+link.",
    );
    expect(
      response.cookies.get("__Secure-supastore-staff.session_token"),
    ).toBeUndefined();
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
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([]));
    mocks.presignAsset.mockResolvedValueOnce("https://storage.test/signed");

    const found = await asset(
      request("https://shop.test/api/assets?key=products%2Fimage.png"),
    );
    expect(found.status).toBe(307);
    expect(found.headers.get("location")).toBe("https://storage.test/signed");

    mocks.db.select
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([]))
      .mockImplementationOnce(() => chain([]));
    const missing = await asset(
      request("https://shop.test/api/assets?key=missing.png"),
    );
    expect(missing.status).toBe(404);
  });

  it("rejects evidence requests from another origin before touching storage", async () => {
    const response = await createEvidenceIntent(
      request("https://shop.test/api/evidence", {
        method: "POST",
        headers: {
          origin: "https://attacker.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          orderId: "00000000-0000-0000-0000-000000000000",
          mime: "image/png",
          size: 10,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Untrusted request origin.",
    });
    expect(mocks.createUploadIntent).not.toHaveBeenCalled();
  });

  it("creates an evidence intent and finalizes it through the authenticated order token", async () => {
    mocks.orderToken.mockResolvedValue("order-session");
    mocks.createUploadIntent.mockResolvedValueOnce({ intentId: "intent-1" });
    mocks.finalizeUpload.mockResolvedValueOnce(undefined);
    const headers = {
      origin: "https://shop.test",
      "content-type": "application/json",
    };
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
        body: JSON.stringify({
          orderId,
          intentId: "00000000-0000-0000-0000-000000000001",
        }),
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

  it.each(["POST", "PATCH"])(
    "accepts evidence %s from the configured storefront origin",
    async (method) => {
      vi.stubEnv("STOREFRONT_ORIGIN", "https://storefront.test");
      mocks.orderToken.mockResolvedValue("scoped-order-token");
      mocks.createUploadIntent.mockResolvedValue({ intentId: "intent" });
      mocks.finalizeUpload.mockResolvedValue(undefined);
      try {
        const handler =
          method === "POST" ? createEvidenceIntent : finalizeEvidence;
        const response = await handler(
          request("https://backend.test/api/evidence", {
            method,
            headers: {
              origin: "https://storefront.test",
              "content-type": "application/json",
              "sec-fetch-site": "same-origin",
            },
            body: JSON.stringify({
              orderId: "00000000-0000-0000-0000-000000000001",
              intentId: "00000000-0000-0000-0000-000000000002",
              mime: "image/png",
              size: 10,
            }),
          }),
        );
        expect(response.status).toBe(200);
        expect(mocks.orderToken).toHaveBeenCalledWith(
          "00000000-0000-0000-0000-000000000001",
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each(["POST", "PATCH"])(
    "rejects cross-site evidence %s even with a configured origin",
    async (method) => {
      vi.stubEnv("STOREFRONT_ORIGIN", "https://storefront.test");
      try {
        const req = request("https://backend.test/api/evidence", {
          method,
          headers: {
            origin: "https://storefront.test",
            "sec-fetch-site": "cross-site",
          },
          body: "unread",
        });
        expect(
          (
            await (method === "POST" ? createEvidenceIntent : finalizeEvidence)(
              req,
            )
          ).status,
        ).toBe(403);
        expect(req.bodyUsed).toBe(false);
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
});
