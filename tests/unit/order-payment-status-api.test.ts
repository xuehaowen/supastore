import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  select: vi.fn(),
  token: vi.fn(),
}));
vi.mock("@/application/use-cases/tracking", () => ({
  trackOrder: mocks.track,
}));
vi.mock("@/infrastructure/web", () => ({ orderToken: mocks.token }));
vi.mock("@/infrastructure/db", () => ({ db: { select: mocks.select } }));
import { GET } from "@/app/api/v1/orders/[id]/route";
import { UnauthorizedError } from "@/application/common/errors";
const id = "12345678-1234-4234-8234-123456789012";
const context = { params: Promise.resolve({ id }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockResolvedValue("private-proof");
  mocks.track.mockResolvedValue({
    order: {
      id,
      lifecycleStatus: "unpaid",
      termsSnapshot: {
        currency: "USD",
        precision: 2,
        payment: { name: "Bank", instructions: "Send bank transfer" },
      },
    },
    items: [],
    receivedCents: 0,
    proposal: null,
    fulfillment: null,
    refunds: [],
    goodsReturns: [],
    returnItems: [],
    evidence: [],
  });
});
it.each([null, "open", "review", "expired"])(
  "exposes payment status %s and suppresses conflicting manual instructions",
  async (status) => {
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: async () => (status ? [{ status }] : []),
      then: (resolve: (value: unknown[]) => unknown) =>
        Promise.resolve([]).then(resolve),
    };
    mocks.select.mockReturnValue(query);
    const response = await GET(
      new Request(`https://shop.example/api/v1/orders/${id}`),
      context,
    );
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.paymentStatus).toBe(status);
    expect(data.order.terms.payment).toEqual(
      status ? null : { name: "Bank", instructions: "Send bank transfer" },
    );
  },
);
it("does not query payment state until private order access succeeds", async () => {
  mocks.track.mockRejectedValue(new UnauthorizedError("Invalid order proof."));
  const response = await GET(
    new Request(`https://shop.example/api/v1/orders/${id}`),
    context,
  );
  expect(response.status).toBe(401);
  expect(mocks.select).not.toHaveBeenCalled();
});
