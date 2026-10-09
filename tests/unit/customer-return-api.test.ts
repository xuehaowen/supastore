import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ request: vi.fn(), token: vi.fn() }));
vi.mock("@/application/use-cases/returns/manage-returns", () => ({
  requestGoodsReturn: mocks.request,
}));
vi.mock("@/infrastructure/web", () => ({ orderToken: mocks.token }));
import { POST } from "@/app/api/v1/orders/[id]/returns/route";
import { UnauthorizedError } from "@/application/common/errors";
const id = "12345678-1234-4234-8234-123456789012";
const context = { params: Promise.resolve({ id }) };
const payload = {
  requestKey: id,
  reason: "Wrong size",
  items: [{ orderItemId: id, quantity: 1 }],
  token: "forged",
};
function request(body: unknown, origin = "https://shop.example") {
  return new Request(`https://shop.example/api/v1/orders/${id}/returns`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue("server-proof");
  mocks.request.mockResolvedValue(id);
});
it("uses the private order cookie and preserves a stable retry key", async () => {
  expect((await POST(request(payload), context)).status).toBe(200);
  expect(mocks.request).toHaveBeenCalledWith({
    orderId: id,
    token: "server-proof",
    requestKey: id,
    reason: "Wrong size",
    items: payload.items,
  });
});
it("rejects cross-origin requests before reading private proof", async () => {
  expect(
    (await POST(request(payload, "https://attacker.example"), context)).status,
  ).toBe(403);
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});
it.each(
  [
    [],
    [{ orderItemId: id, quantity: 0 }],
    [{ orderItemId: id, quantity: 1.5 }],
    [null],
  ].map((items) => ({ items })),
)("rejects invalid return selections $items", async ({ items }) => {
  expect((await POST(request({ ...payload, items }), context)).status).toBe(
    400,
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
it("preserves domain access rejection", async () => {
  mocks.request.mockRejectedValue(
    new UnauthorizedError("Invalid order proof."),
  );
  expect((await POST(request(payload), context)).status).toBe(401);
});
