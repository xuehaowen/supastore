import { expect, it } from "vitest";
import { textFor } from "@supastore/i18n/messages";
it("describes the requested value rather than instructing amount-copy users to copy a reference", () => {
  expect(textFor("en").common.copyFailed).not.toMatch(/reference/i);
  expect(textFor("zh").common.copyFailed).not.toContain("参考编号");
});
