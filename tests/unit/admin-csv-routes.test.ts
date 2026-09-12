import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/application/common/errors";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  verifyStaff: vi.fn(),
  importProductsCsv: vi.fn(),
  parseProductCsv: vi.fn(),
  streamProductsCsv: vi.fn(),
  streamOrdersCsv: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/infrastructure/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/infrastructure/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/infrastructure/auth/session", () => ({ verifyStaffInTransaction: mocks.verifyStaff }));
vi.mock("@/application/use-cases/catalog/import-products-csv", () => ({
  importProductsCsv: mocks.importProductsCsv,
  parseProductCsv: mocks.parseProductCsv,
}));
vi.mock("@/application/use-cases/catalog/export-csv", () => ({
  streamProductsCsv: mocks.streamProductsCsv,
  streamOrdersCsv: mocks.streamOrdersCsv,
}));

import { GET as getOrderExport } from "@/app/api/admin/exports/orders/route";
import { GET as getProductExport } from "@/app/api/admin/exports/products/route";
import { POST as importProducts } from "@/app/api/admin/imports/products/route";

describe("admin CSV routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "customer-id" } });
    mocks.transaction.mockImplementation(async (work) => work({}));
    mocks.verifyStaff.mockResolvedValue({ userId: "staff-id", role: "staff" });
    mocks.streamProductsCsv.mockImplementation(async function* () { yield "header\n"; });
    mocks.streamOrdersCsv.mockImplementation(async function* () { yield "header\n"; });
  });

  it.each([
    ["products", getProductExport],
    ["orders", getOrderExport],
  ])("returns 401 when the %s export has no session", async (_, handler) => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await handler(
      new Request("http://localhost/api/admin/exports") as never,
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["products", getProductExport],
    ["orders", getOrderExport],
  ])("returns 403 to non-staff callers of the %s export", async (_, handler) => {
    mocks.verifyStaff.mockRejectedValueOnce(new ForbiddenError("forbidden"));
    const response = await handler(
      new Request("http://localhost/api/admin/exports") as never,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Staff access required" });
  });

  it.each([
    ["products", getProductExport],
    ["orders", getOrderExport],
  ])("returns 500 when %s export access verification fails", async (_, handler) => {
    mocks.transaction.mockRejectedValueOnce(new Error("database offline"));
    const response = await handler(
      new Request("http://localhost/api/admin/exports") as never,
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to verify access" });
  });

  it("returns 401 for an unauthenticated product import", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    const response = await importProducts(new Request("http://localhost/api/admin/imports/products", { method: "POST", body: new FormData() }) as never);
    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns 403 to a signed-in non-staff product importer", async () => {
    mocks.verifyStaff.mockRejectedValueOnce(new ForbiddenError("forbidden"));
    const response = await importProducts(
      new Request("http://localhost/api/admin/imports/products", { method: "POST" }) as never,
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Staff access required" });
    expect(mocks.importProductsCsv).not.toHaveBeenCalled();
  });

  it("returns 500 when product-import access verification fails", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("database offline"));
    const response = await importProducts(
      new Request("http://localhost/api/admin/imports/products", { method: "POST" }) as never,
    );
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to verify access" });
    expect(mocks.importProductsCsv).not.toHaveBeenCalled();
  });
});
