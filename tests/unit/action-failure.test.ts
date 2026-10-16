import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
import { perform } from "@/app/actions/common";
import { logger } from "@/infrastructure/security/logger";
afterEach(() => vi.restoreAllMocks());
it("logs unexpected admin save failures with a safe correlation identifier", async () => {
  const error = vi.fn();
  const child = vi.spyOn(logger, "child").mockReturnValue({ ...logger, error });
  await expect(
    perform("/admin/products", async () => {
      throw new Error("private database address");
    }),
  ).rejects.toThrow("requestId=");
  expect(child).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "admin.action",
      requestId: expect.any(String),
    }),
  );
  expect(JSON.stringify(error.mock.calls)).not.toContain("private");
});
