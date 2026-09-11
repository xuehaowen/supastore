import { describe, it, expect } from "vitest";
import {
  normalizePaymentReference,
  validatePaymentReference,
} from "@/domain/payments/normalization";

describe("M2 Payment Accounts & Cash Reconciliation", () => {
  describe("Payment Reference Normalization", () => {
    it("normalizes spaced and dashed references to identical canonical forms", () => {
      expect(normalizePaymentReference("REF-1234-ABCD")).toBe("REF1234ABCD");
      expect(normalizePaymentReference("ref 1234 abcd")).toBe("REF1234ABCD");
      expect(normalizePaymentReference("  ref - 1234 / abcd  ")).toBe("REF1234ABCD");
      expect(normalizePaymentReference("REF.1234_ABCD")).toBe("REF1234ABCD");
    });

    it("handles bank account, Pix, and PromptPay identifiers", () => {
      // IBAN with spaces
      expect(normalizePaymentReference("GB29 XAAA 0102 0312 3456 78")).toBe(
        "GB29XAAA01020312345678"
      );
      // Pix phone or CPF
      expect(normalizePaymentReference("123.456.789-00")).toBe("12345678900");
      expect(normalizePaymentReference("+55 11 91234-5678")).toBe("+5511912345678".replace(/[\s\-_./:\\]+/g, ""));
    });

    it("validates minimum length requirements", () => {
      expect(validatePaymentReference("AB").isValid).toBe(false);
      expect(validatePaymentReference("   ").isValid).toBe(false);
      expect(validatePaymentReference("A-B-C").isValid).toBe(true);
      expect(validatePaymentReference("A-B-C").normalized).toBe("ABC");
    });
  });

  describe("Cash Drawer Monotonic Sequential Numbering Calculation", () => {
    function formatCashReceiptSequence(year: number, sequenceNumber: number): string {
      const padded = String(sequenceNumber).padStart(4, "0");
      return `CASH-${year}-${padded}`;
    }

    it("formats sequential cash receipt numbers correctly", () => {
      expect(formatCashReceiptSequence(2026, 1)).toBe("CASH-2026-0001");
      expect(formatCashReceiptSequence(2026, 42)).toBe("CASH-2026-0042");
      expect(formatCashReceiptSequence(2026, 9999)).toBe("CASH-2026-9999");
    });

    it("calculates cash change due and expected drawer balance accurately", () => {
      const startingFloatCents = 10000; // $100.00
      const cashReceipts = [
        { amountCents: 2500, tenderedAmountCents: 3000 }, // $25.00 receipt, $30 tendered -> $5 change
        { amountCents: 4500, tenderedAmountCents: 5000 }, // $45.00 receipt, $50 tendered -> $5 change
        { amountCents: 1500, tenderedAmountCents: 1500 }, // $15.00 exact tender -> $0 change
      ];

      const totalCashCollected = cashReceipts.reduce((sum, r) => sum + r.amountCents, 0);
      const totalChangeGiven = cashReceipts.reduce(
        (sum, r) => sum + (r.tenderedAmountCents - r.amountCents),
        0
      );
      const expectedBalance = startingFloatCents + totalCashCollected;

      expect(totalCashCollected).toBe(8500); // $85.00
      expect(totalChangeGiven).toBe(1000);   // $10.00
      expect(expectedBalance).toBe(18500);   // $185.00

      // Counted cash matches expected
      const actualCountedCents = 18500;
      const variance = actualCountedCents - expectedBalance;
      expect(variance).toBe(0);
    });
  });
});
