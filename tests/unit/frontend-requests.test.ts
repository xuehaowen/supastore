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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

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
    ).rejects.toThrow("We couldn't sign you in. Please check your details and try again.");
  });

  it("performs evidence intent, upload, and finalize in order", async () => {
    const file = new Blob(["image"], { type: "image/png" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/evidence") {
        if (init?.method === "POST") {
          expect(init.body).toBe(JSON.stringify({ orderId: "order-1", mime: "image/png", size: 5 }));
          return new Response(JSON.stringify({ intentId: "intent-1" }), { status: 200 });
        }
        expect(init?.method).toBe("PATCH");
        expect(init?.body).toBe(JSON.stringify({ orderId: "order-1", intentId: "intent-1" }));
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      expect(url).toBe("/api/evidence/upload?orderId=order-1&intentId=intent-1");
      expect(init?.method).toBe("PUT");
      expect(init?.body).toBe(file);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    await expect(uploadEvidence("order-1", file)).resolves.toEqual({ intentId: "intent-1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces an upload API error and does not continue the sequence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload expired." }), { status: 400 }),
    );

    await expect(uploadEvidence("order-1", new Blob(["x"], { type: "image/png" }))).rejects.toThrow(
      "Upload expired.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("imports a CSV and preserves validation errors from the backend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [{ line: 2, field: "sku", message: "Required" }] }), {
        status: 422,
      }),
    );
    const file = new File(["handle,sku\nitem,\n"], "products.csv", { type: "text/csv" });

    await expect(importProductsCsv(file)).rejects.toThrow("Line 2: Required");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/imports/products");
    expect((fetchMock.mock.calls[0]?.[1]?.body as FormData).get("file")).toBe(file);
  });

  it("downloads an export and derives a safe fallback filename", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("handle,sku\n", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );

    await expect(downloadAdminExport("orders")).resolves.toMatchObject({ filename: "orders.csv" });
    expect(fetch).toHaveBeenCalledWith("/api/admin/exports/orders");
  });
});
