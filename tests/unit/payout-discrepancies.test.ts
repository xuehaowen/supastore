import { describe, it, expect } from "vitest";
import {
  classifyPayoutTransfer,
  areDestinationsEqual,
  type Destination,
} from "@/domain/financial-projection/discrepancies";

describe("M2 Financial Refunds & Payout Settlement", () => {
  const destA: Destination = {
    type: "bank_account",
    accountNumberHash: "hash-acc-123",
  };
  const destB: Destination = {
    type: "bank_account",
    accountNumberHash: "hash-acc-999",
  };

  describe("Destination Comparison", () => {
    it("matches identical destinations and rejects mismatched destinations", () => {
      expect(areDestinationsEqual(destA, destA)).toBe(true);
      expect(areDestinationsEqual(destA, destB)).toBe(false);
      expect(
        areDestinationsEqual(
          { type: "cash" },
          { type: "bank_account" }
        )
      ).toBe(false);
    });
  });

  describe("Payout Settlement & Discrepancy Classification (A8)", () => {
    it("classifies exact full transfer matching destination", () => {
      const result = classifyPayoutTransfer({
        actualAmountCents: 5000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 0,
        claimedDestination: destA,
        actualDestination: destA,
        attemptClaimedAmountCents: 5000,
        priorActualTransfersForAttemptCents: 0,
      });

      expect(result.customerSettlementCents).toBe(5000);
      expect(result.erroneousDisbursementCents).toBe(0);
      expect(result.remainingUnsettledCents).toBe(0);
      expect(result.isClaimLimitBreached).toBe(false);
      expect(result.isDestinationMatched).toBe(true);
    });

    it("classifies partial transfer with remaining unsettled entitlement", () => {
      // Verified $30 transfer against a $50 claim yields C=30, E=0, U=20
      const result = classifyPayoutTransfer({
        actualAmountCents: 3000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 0,
        claimedDestination: destA,
        actualDestination: destA,
        attemptClaimedAmountCents: 5000,
        priorActualTransfersForAttemptCents: 0,
      });

      expect(result.customerSettlementCents).toBe(3000);
      expect(result.erroneousDisbursementCents).toBe(0);
      expect(result.remainingUnsettledCents).toBe(2000); // $20 remainder
      expect(result.isClaimLimitBreached).toBe(false);
      expect(result.isDestinationMatched).toBe(true);
    });

    it("classifies $50 paid against a $30 claim on a $50 authorization (claim breach, full settlement, 0 loss)", () => {
      const result = classifyPayoutTransfer({
        actualAmountCents: 5000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 0,
        claimedDestination: destA,
        actualDestination: destA,
        attemptClaimedAmountCents: 3000, // Claimed only $30
        priorActualTransfersForAttemptCents: 0,
      });

      expect(result.customerSettlementCents).toBe(5000); // Customer is entitled to full $50
      expect(result.erroneousDisbursementCents).toBe(0);
      expect(result.remainingUnsettledCents).toBe(0);
      expect(result.isClaimLimitBreached).toBe(true); // Exceeded the $30 claim intent
    });

    it("classifies transfer sent to wrong destination as 100% erroneous disbursement", () => {
      const result = classifyPayoutTransfer({
        actualAmountCents: 5000,
        allocationAuthorizedCents: 5000,
        priorSettledCentsAcrossAttempts: 0,
        claimedDestination: destA,
        actualDestination: destB, // Mismatched destination
        attemptClaimedAmountCents: 5000,
        priorActualTransfersForAttemptCents: 0,
      });

      expect(result.customerSettlementCents).toBe(0);
      expect(result.erroneousDisbursementCents).toBe(5000); // Full amount is erroneous
      expect(result.remainingUnsettledCents).toBe(5000); // Customer is still owed $50
      expect(result.isDestinationMatched).toBe(false);
    });
  });
});
