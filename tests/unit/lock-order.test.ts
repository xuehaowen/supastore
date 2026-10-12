import { describe, expect, it, vi } from "vitest";
import {
  acquireTransactionLocks,
  sortUniqueUuids,
} from "@/domain/locking/lock-order";

describe("transaction lock ordering", () => {
  it("sorts and de-duplicates UUID targets while handling empty input", () => {
    expect(sortUniqueUuids()).toEqual([]);
    expect(sortUniqueUuids([])).toEqual([]);
    expect(sortUniqueUuids(["b", "a", "b"])).toEqual(["a", "b"]);
  });

  it("acquires every lock family in the documented order", async () => {
    const execute = vi.fn().mockResolvedValue([]);

    await acquireTransactionLocks({ execute } as never, {
      lockStoreSettings: true,
      cartIds: ["cart-b", "cart-a", "cart-a"],
      orderIds: ["order-b", "order-a"],
      paymentAccountIds: ["account-a"],
      receiptIds: ["receipt-a"],
      allocationIds: ["allocation-a"],
      payoutAttemptIds: ["attempt-a"],
    });

    expect(execute).toHaveBeenCalledTimes(9);
    expect(execute.mock.invocationCallOrder).toEqual(
      [...execute.mock.invocationCallOrder].sort((a, b) => a - b),
    );
  });
});
