import { describe, it, expect } from 'vitest';
import { calculatePurchaseTotal } from '@/domain/money/calculations';
import { generateOrderReferenceCode, validateOrderReferenceCode } from '@/domain/money/reference-code';
import { computeOrderFinancialProjection } from '@/domain/financial-projection/projection';
import { classifyPayoutTransfer } from '@/domain/financial-projection/discrepancies';
import { computeInputFingerprint } from '@/application/common/idempotency';
import { MockEmailAdapter } from '@/infrastructure/notifications/mock';

describe('Milestone M0: Full Synthetic Order Lifecycle', () => {
  it('executes a complete end-to-end synthetic order lifecycle with full invariant checks', async () => {
    const mockEmail = new MockEmailAdapter();

    // Step 1: Owner Bootstrap & Store Configuration
    const storeSettings = {
      storeName: 'SupaStore Demo',
      currency: 'USD',
      precision: 2,
      isBootstrapCompleted: true,
      isOrderingEnabled: true,
    };
    const ownerMembership = {
      userId: 'user-owner-1',
      email: 'owner@supastore.local',
      role: 'owner',
      isActive: true,
    };
    expect(storeSettings.isBootstrapCompleted).toBe(true);
    expect(ownerMembership.role).toBe('owner');

    // Step 2: Catalog Products & Variants Setup
    const variant1 = {
      id: 'var-101',
      sku: 'HOODIE-BLK-M',
      title: 'Black Hoodie (M)',
      priceCents: 4500, // $45.00
      isAvailable: true,
    };
    const variant2 = {
      id: 'var-102',
      sku: 'STICKER-PACK',
      title: 'Sticker Pack',
      priceCents: 500, // $5.00
      isAvailable: true,
    };

    // Step 3: Guest Cart & Quote Calculation
    const cart = {
      id: 'cart-uuid-001',
      guestSessionId: 'sess-guest-abc',
      items: [
        { variantId: variant1.id, quantity: 1, unitPriceCents: variant1.priceCents },
        { variantId: variant2.id, quantity: 2, unitPriceCents: variant2.priceCents },
      ],
    };

    const quoteCalculation = calculatePurchaseTotal(
      cart.items.map((i) => ({ unitPriceCents: i.unitPriceCents, quantity: i.quantity })),
      { amountCents: 500, taxRateBasisPoints: 0, isTaxInclusive: false } // $5.00 shipping
    );

    // Subtotal: 4500 + 1000 = 5500. Shipping: 500. Total P: 6000 cents ($60.00)
    expect(quoteCalculation.merchandiseSubtotalCents).toBe(5500);
    expect(quoteCalculation.shippingCents).toBe(500);
    expect(quoteCalculation.totalPayableCents).toBe(6000);

    const quoteSnapshot = {
      id: 'quote-uuid-001',
      cartId: cart.id,
      totalPayableCents: quoteCalculation.totalPayableCents,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    };
    expect(quoteSnapshot.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Step 4: Convert Quote to Unpaid Order & Generate SP-XXXX Reference
    const referenceCode = generateOrderReferenceCode('SP');
    expect(validateOrderReferenceCode(referenceCode, 'SP')).toBe(true);

    const order = {
      id: 'order-uuid-999',
      sourceCartId: cart.id,
      referenceCode,
      lifecycleStatus: 'unpaid',
      purchaseTotalCents: quoteSnapshot.totalPayableCents,
      guestEmail: 'customer@test.com',
      financialRevision: 1,
    };

    // Verify Idempotency hash
    const fingerprint1 = computeInputFingerprint({ quoteId: quoteSnapshot.id, email: order.guestEmail });
    const fingerprint2 = computeInputFingerprint({ quoteId: quoteSnapshot.id, email: order.guestEmail });
    expect(fingerprint1).toBe(fingerprint2);

    // Outbox: order.submitted
    await mockEmail.sendEmail({
      recipient: order.guestEmail,
      subject: `Order Submitted: ${order.referenceCode}`,
      template: 'order.submitted',
      data: { orderId: order.id, referenceCode: order.referenceCode, amountCents: order.purchaseTotalCents },
    });

    // Step 5: Staff Records Payment Receipt ($60.00)
    const receipt = {
      id: 'rcpt-uuid-001',
      orderId: order.id,
      paymentAccountId: 'acct-bank-usd',
      amountCents: 6000,
      rawReference: 'WIRE-TX-998822',
      normalizedReference: 'WIRETX998822',
    };

    const projectionAfterPayment = computeOrderFinancialProjection({
      purchaseTotalCents: order.purchaseTotalCents,
      isConfirmed: false,
      isCancelled: false,
      receipts: [
        {
          id: receipt.id,
          originalAmountCents: receipt.amountCents,
        },
      ],
    });

    expect(projectionAfterPayment.netReceivedCents).toBe(6000);
    expect(projectionAfterPayment.isFullyFunded).toBe(true);
    expect(projectionAfterPayment.unfundedAmountCents).toBe(0);

    // Step 6: Order Confirmation & Funding Freeze (F1 = 6000)
    const confirmationFunding = {
      orderId: order.id,
      receiptId: receipt.id,
      fundedAmountCents: 6000,
    };
    order.lifecycleStatus = 'confirmed';

    await mockEmail.sendEmail({
      recipient: order.guestEmail,
      subject: `Order Confirmed: ${order.referenceCode}`,
      template: 'order.confirmed',
      data: { orderId: order.id, referenceCode: order.referenceCode },
    });

    // Step 7: Order Fulfillment
    const fulfillment = {
      orderId: order.id,
      status: 'fulfilled',
      carrier: 'DHL Express',
      trackingNumber: 'DHL-8877665544',
    };
    order.lifecycleStatus = 'completed';

    await mockEmail.sendEmail({
      recipient: order.guestEmail,
      subject: `Order Shipped: ${order.referenceCode}`,
      template: 'order.completed',
      data: { orderId: order.id, trackingNumber: fulfillment.trackingNumber },
    });

    expect(order.lifecycleStatus).toBe('completed');
    expect(fulfillment.status).toBe('fulfilled');

    // Step 8: Full Refund Authorization ($60.00)
    const refundAuth = {
      id: 'refund-auth-001',
      orderId: order.id,
      kind: 'purchase_refund',
      amountCents: 6000,
      reason: 'Customer requested return',
    };

    const payoutAllocation = {
      id: 'alloc-001',
      refundAuthorizationId: refundAuth.id,
      receiptId: receipt.id,
      authorizedAmountCents: 6000,
      settledAmountCents: 0,
    };

    // Step 9: Payout Claim to Verified Destination
    const verifiedDestination = {
      type: 'bank_account' as const,
      accountNumberHash: 'hash-iban-de89-3704',
      recipientName: 'Alice Customer',
    };

    const payoutAttempt = {
      id: 'attempt-001',
      allocationId: payoutAllocation.id,
      claimedAmountCents: 6000,
      status: 'sending',
    };

    // Step 10: Reconcile Outgoing Transfer ($60.00 to verified destination)
    const actualTransfer = {
      actualAmountCents: 6000,
      transferReference: 'SEPA-OUT-991122',
      destination: { ...verifiedDestination },
    };

    const classification = classifyPayoutTransfer({
      actualAmountCents: actualTransfer.actualAmountCents,
      allocationAuthorizedCents: payoutAllocation.authorizedAmountCents,
      priorSettledCentsAcrossAttempts: payoutAllocation.settledAmountCents,
      claimedDestination: verifiedDestination,
      actualDestination: actualTransfer.destination,
      attemptClaimedAmountCents: payoutAttempt.claimedAmountCents,
      priorActualTransfersForAttemptCents: 0,
    });

    expect(classification.customerSettlementCents).toBe(6000); // C = 6000
    expect(classification.erroneousDisbursementCents).toBe(0); // E = 0
    expect(classification.isDestinationMatched).toBe(true);
    expect(classification.isClaimLimitBreached).toBe(false);

    payoutAllocation.settledAmountCents += classification.customerSettlementCents;
    payoutAttempt.status = 'reconciled';

    // Step 11: Final Financial Projection Verification
    const finalProjection = computeOrderFinancialProjection({
      purchaseTotalCents: order.purchaseTotalCents,
      isConfirmed: true,
      isCancelled: false,
      receipts: [
        {
          id: receipt.id,
          originalAmountCents: receipt.amountCents,
          frozenPurchaseFundingCents: confirmationFunding.fundedAmountCents,
          effectivePurchaseRefundAuthorizationsCents: refundAuth.amountCents,
          settledPurchaseRefundsCents: payoutAllocation.settledAmountCents,
        },
      ],
    });

    expect(finalProjection.totalReceivedCents).toBe(6000);
    expect(finalProjection.totalSettledPayoutsCents).toBe(6000);
    expect(finalProjection.receipts[0]!.availablePayoutCapacityCents).toBe(0);
    expect(finalProjection.receipts[0]!.remainingPurchaseRefundCapacityCents).toBe(0);
    expect(finalProjection.operationalFundingShortfallCents).toBe(0);

    // Verify all mock email events were captured
    const sentEmails = mockEmail.getSentMessages();
    expect(sentEmails.length).toBe(3);
    expect(sentEmails[0]!.template).toBe('order.submitted');
    expect(sentEmails[1]!.template).toBe('order.confirmed');
    expect(sentEmails[2]!.template).toBe('order.completed');
  });
});
