import { expect, it, vi } from "vitest";
import { updateConfiguredSlotCapacity } from "@/application/use-cases/store/slot-capacity";
import type { Transaction } from "@/application/common/transaction";
function fixture(count: number) {
  const update = vi.fn();
  const lock = vi.fn().mockResolvedValue([{ id: "slot" }]);
  const query = { from: vi.fn(), where: vi.fn(), orderBy: vi.fn(), for: lock };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  const usage = { from: () => ({ where: () => Promise.resolve([{ count }]) }) };
  const tx = {
    select: vi.fn().mockReturnValueOnce(query).mockReturnValueOnce(usage),
    update,
  };
  update.mockReturnValue({
    set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
  });
  return { tx: tx as unknown as Transaction, update, lock };
}
it("locks slots and rejects reductions below active plus consumed bookings", async () => {
  const f = fixture(3);
  await expect(
    updateConfiguredSlotCapacity(f.tx, { deliveryAreaId: "area" }, 2),
  ).rejects.toThrow("already booked");
  expect(f.lock).toHaveBeenCalledWith("update");
  expect(f.update).not.toHaveBeenCalled();
});
it("allows exact committed capacity and unlimited capacity", async () => {
  for (const capacity of [3, null]) {
    const f = fixture(3);
    await updateConfiguredSlotCapacity(
      f.tx,
      { deliveryAreaId: "area" },
      capacity,
    );
    expect(f.update).toHaveBeenCalledOnce();
  }
});
