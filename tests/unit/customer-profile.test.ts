import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  verifiedCustomer: vi.fn(),
}));
vi.mock("@/infrastructure/db", () => ({
  db: { transaction: mocks.transaction },
}));
vi.mock("@/application/use-cases/customers/customer-ownership", () => ({
  verifiedCustomer: mocks.verifiedCustomer,
}));
import {
  updateCustomerProfile,
  validateCustomerProfile,
} from "@/application/use-cases/customers/update-profile";
beforeEach(() => vi.clearAllMocks());
it("bounds names and phones, trims fields and permits removing a phone", () => {
  expect(validateCustomerProfile({ name: "  Customer  ", phone: " " })).toEqual(
    { name: "Customer", phone: null },
  );
  expect(() => validateCustomerProfile({ name: " ", phone: "" })).toThrow();
  expect(() =>
    validateCustomerProfile({ name: "a".repeat(101), phone: "" }),
  ).toThrow();
  expect(() =>
    validateCustomerProfile({ name: "Jane", phone: "bad phone" }),
  ).toThrow();
});
it("writes nothing if the server identity cannot resolve a verified customer", async () => {
  const update = vi.fn();
  mocks.transaction.mockImplementation((work) => work({ update }));
  mocks.verifiedCustomer.mockRejectedValue(new Error("Unauthorized"));
  await expect(
    updateCustomerProfile("server-user", {
      name: "Jane",
      phone: "+1 555 1234",
    }),
  ).rejects.toThrow("Unauthorized");
  expect(update).not.toHaveBeenCalled();
  expect(mocks.verifiedCustomer).toHaveBeenCalledWith(
    expect.anything(),
    "server-user",
  );
});
it("updates identity and owned customer atomically without touching orders or addresses", async () => {
  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });
  mocks.transaction.mockImplementation((work) => work({ update }));
  mocks.verifiedCustomer.mockResolvedValue({ id: "owned-customer" });
  await updateCustomerProfile("server-user", {
    name: "Jane",
    phone: "+1 555 1234",
  });
  expect(update).toHaveBeenCalledTimes(2);
  expect(set).toHaveBeenLastCalledWith(
    expect.objectContaining({ name: "Jane", phone: "+1 555 1234" }),
  );
});
