import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticate,
  downloadAdminExport,
  importProductsCsv,
  signOutSession,
  uploadEvidence,
} from "@/app/client-requests";

describe("frontend backend request contracts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("signs out with the expected same-origin request", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await signOutSession();

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("sends sign-in credentials and returns a JSON payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { emailVerified: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      authenticate("sign-in", {
        name: null,
        email: "buyer@example.com",
        password: "a-secure-password",
        callbackURL: "/en/account",
      }),
    ).resolves.toEqual({ user: { emailVerified: true } });
    expect(fetch).toHaveBeenCalledWith("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: null,
        email: "buyer@example.com",
        password: "a-secure-password",
        callbackURL: "/en/account",
      }),
    });
  });

  it("turns non-JSON auth failures into a stable user-facing error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("gateway unavailable", { status: 502 }),
    );

    await expect(
      authenticate("sign-in", {
        name: null,
        email: "buyer@example.com",
        password: "a-secure-password",
        callbackURL: "/en/account",
      }),
    ).rejects.toThrow(
      "We couldn't sign you in. Please check your details and try again.",
    );
  });

  it("performs evidence intent, upload, and finalize in order", async () => {
    const file = new Blob(["image"], { type: "image/png" });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url === "/api/evidence") {
          if (init?.method === "POST") {
            expect(init.body).toBe(
              JSON.stringify({
                orderId: "order-1",
                mime: "image/png",
                size: 5,
              }),
            );
            return new Response(JSON.stringify({ intentId: "intent-1" }), {
              status: 200,
            });
          }
          expect(init?.method).toBe("PATCH");
          expect(init?.body).toBe(
            JSON.stringify({ orderId: "order-1", intentId: "intent-1" }),
          );
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
          });
        }
        expect(url).toBe(
          "/api/evidence/upload?orderId=order-1&intentId=intent-1",
        );
        expect(init?.method).toBe("PUT");
        expect(init?.body).toBe(file);
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      });

    await expect(uploadEvidence("order-1", file)).resolves.toEqual({
      intentId: "intent-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces an upload API error and does not continue the sequence", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Upload expired." }), {
          status: 400,
        }),
      );

    await expect(
      uploadEvidence("order-1", new Blob(["x"], { type: "image/png" })),
    ).rejects.toThrow("Upload expired.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("imports a CSV and preserves validation errors from the backend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          errors: [{ line: 2, field: "sku", message: "Required" }],
        }),
        {
          status: 422,
        },
      ),
    );
    const file = new File(["handle,sku\nitem,\n"], "products.csv", {
      type: "text/csv",
    });

    await expect(importProductsCsv(file)).rejects.toThrow("Line 2: Required");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/imports/products");
    expect((fetchMock.mock.calls[0]?.[1]?.body as FormData).get("file")).toBe(
      file,
    );
  });

  it("downloads an export and derives a safe fallback filename", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("handle,sku\n", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );

    await expect(downloadAdminExport("orders")).resolves.toMatchObject({
      filename: "orders.csv",
    });
    expect(fetch).toHaveBeenCalledWith("/api/admin/exports/orders");
  });
});

const credentials = {
  name: "Customer",
  email: "buyer@example.test",
  password: "synthetic-password",
  callbackURL: "/en/account",
};
const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status });

describe("frontend failure and retry boundaries", () => {
  beforeEach(() => vi.restoreAllMocks());
  it.each([
    [{ error: { message: "Incorrect credentials" } }, "Incorrect credentials"],
    [{ message: "Access denied" }, "Access denied"],
    [{ error: { message: 3 } }, "We couldn't sign you in"],
    [{ error: { message: "" }, message: "" }, "We couldn't sign you in"],
    [{ error: {} }, "We couldn't sign you in"],
  ])("renders supported auth error payload %j", async (payload, message) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload, 401));
    await expect(authenticate("sign-in", credentials)).rejects.toThrow(message);
  });
  it("explains email verification to customers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "Email not verified" }, 403),
    );
    await expect(
      authenticate("sign-in", credentials, { customer: true }),
    ).rejects.toThrow("Please verify your email");
  });
  it("preserves non-verification errors for customers", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: "Invalid credentials" }, 401),
    );
    await expect(
      authenticate("sign-in", credentials, { customer: true }),
    ).rejects.toThrow("Invalid credentials");
  });
  it("sends registration to its own endpoint", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ user: { emailVerified: false } }));
    await expect(authenticate("sign-up", credentials)).resolves.toMatchObject({
      user: { emailVerified: false },
    });
    expect(request).toHaveBeenCalledWith(
      "/api/auth/sign-up/email",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(credentials),
      }),
    );
  });
  it.each([null, {}, { intentId: "" }, { intentId: 123 }])(
    "rejects malformed upload intent %j",
    async (payload) => {
      const request = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(jsonResponse(payload));
      await expect(uploadEvidence("order", new Blob(["x"]))).rejects.toThrow(
        "Upload failed",
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );
  it.each([1, 2, 3])(
    "stops an interrupted upload at request %i",
    async (stage) => {
      const request = vi.spyOn(globalThis, "fetch");
      for (let i = 1; i < stage; i++)
        request.mockResolvedValueOnce(
          jsonResponse(i === 1 ? { intentId: "intent" } : {}),
        );
      request.mockResolvedValueOnce(
        new Response("gateway failure", { status: 502 }),
      );
      await expect(uploadEvidence("order", new Blob(["x"]))).rejects.toThrow(
        stage === 2 ? "Upload interrupted" : "Upload failed",
      );
      expect(request).toHaveBeenCalledTimes(stage);
    },
  );
  it("propagates network failure so callers can retry", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Network unavailable"),
    );
    await expect(uploadEvidence("order", new Blob(["x"]))).rejects.toThrow(
      "Network unavailable",
    );
  });
  it.each([null, {}, { success: false, error: "Unauthorized" }])(
    "rejects unsuccessful CSV import %j",
    async (payload) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(payload));
      await expect(
        importProductsCsv(new File(["data"], "products.csv")),
      ).rejects.toThrow(payload?.error ?? "Import failed");
    },
  );
  it("returns CSV import totals", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ success: true, created: 2, updated: 1 }),
    );
    await expect(
      importProductsCsv(new File(["data"], "products.csv")),
    ).resolves.toEqual({ success: true, created: 2, updated: 1 });
  });
  it.each([true, false])("rejects failed export (JSON: %s)", async (isJson) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      isJson
        ? jsonResponse({ error: "Owner access required" }, 403)
        : new Response("gateway failure", { status: 502 }),
    );
    await expect(downloadAdminExport("orders")).rejects.toThrow(
      isJson ? "Owner access required" : "Unable to download the export",
    );
  });
  it("preserves downloaded CSV contents and filename", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("sku,title\nitem,Item", {
        headers: {
          "content-disposition": 'attachment; filename="inventory.csv"',
        },
      }),
    );
    const result = await downloadAdminExport("products");
    expect(result.filename).toBe("inventory.csv");
    expect(await result.blob.text()).toBe("sku,title\nitem,Item");
  });
});
