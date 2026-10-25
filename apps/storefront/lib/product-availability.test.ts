import { expect, it } from "vitest";
import { variantCanBePurchased } from "./product-availability";
it("requires a manually available variant and positive stock when stock is tracked", () => {
  expect(variantCanBePurchased({ id: "loaf", isAvailable: true }, {})).toBe(
    true,
  );
  expect(
    variantCanBePurchased({ id: "loaf", isAvailable: true }, { loaf: 2 }),
  ).toBe(true);
  for (const quantity of [0, -1])
    expect(
      variantCanBePurchased(
        { id: "loaf", isAvailable: true },
        { loaf: quantity },
      ),
    ).toBe(false);
  expect(
    variantCanBePurchased({ id: "loaf", isAvailable: false }, { loaf: 4 }),
  ).toBe(false);
  expect(variantCanBePurchased(undefined, {})).toBe(false);
});
