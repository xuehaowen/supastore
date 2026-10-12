"use server";
import { DomainError } from "@/application/common/errors";
import {
  parseActionDestination,
  parseActionEnum,
  parseActionInteger,
  parseActionUuid,
} from "@/application/common/request-validation";
import { confirmOrder } from "@/application/use-cases/confirm-order";
import { fulfillOrder } from "@/application/use-cases/fulfill-order";
import { dispatchOrder } from "@/application/use-cases/fulfillment/dispatch-order";
import {
  completePickupHandoff,
  correctFulfillment,
  markReadyForPickup,
} from "@/application/use-cases/fulfillment/fulfillment-operations";
import { proposeOrderChange } from "@/application/use-cases/order-proposals";
import { cancelOrder } from "@/application/use-cases/orders/cancel-order";
import { authorizeSurplusReturn } from "@/application/use-cases/orders/surplus-return";
import { correctReceipt } from "@/application/use-cases/payments/correct-receipt";
import { recordCashReceipt } from "@/application/use-cases/payments/record-cash-receipt";
import { recordReceipt } from "@/application/use-cases/record-receipt";
import {
  authorizeRefund,
  claimPayout,
  closePayoutAttempt,
  reconcilePayout,
  resolvePayoutDiscrepancy,
} from "@/application/use-cases/refund-payout";
import { staffIdentity } from "@/infrastructure/web";
import { adminReturnPath, field, perform } from "./common";
export async function proposeChange(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await proposeOrderChange({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      totalCents: parseActionInteger(
        field(form, "total"),
        "Proposed total",
        0,
        2147483647,
      ),
      reason: field(form, "reason"),
    });
  });
}
export async function receivePayment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    if (!form.has("verified"))
      throw new DomainError(
        "Verify the receiving account against the actual payment.",
      );
    await recordReceipt({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      paymentAccountId: parseActionUuid(
        field(form, "accountId"),
        "Payment account",
      ),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Received amount",
        1,
        2147483647,
      ),
      rawReference: field(form, "reference"),
    });
  });
}
export async function confirmPayment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await confirmOrder({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
    });
  });
}

export async function fulfillConfirmedOrder(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await fulfillOrder({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      ...(field(form, "carrier") ? { carrier: field(form, "carrier") } : {}),
      ...(field(form, "trackingNumber")
        ? { trackingNumber: field(form, "trackingNumber") }
        : {}),
    });
  });
}
export async function dispatchConfirmedOrder(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await dispatchOrder({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      carrier: field(form, "carrier"),
      ...(field(form, "trackingNumber")
        ? { trackingNumber: field(form, "trackingNumber") }
        : {}),
    });
  });
}
export async function markOrderReady(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await markReadyForPickup({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
    });
  });
}

export async function completeOrderPickup(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    const verificationMethod = parseActionEnum(
      field(form, "verificationMethod"),
      "Verification method",
      ["scoped_order_page", "owner_assisted"] as const,
    );
    await completePickupHandoff({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      handoffActor: field(form, "handoffActor"),
      verificationMethod,
    });
  });
}

export async function cancelAdminOrder(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await cancelOrder({
      actorUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      reason: field(form, "reason"),
      isCustomerRequest: form.has("customerRequest"),
    });
  });
}

export async function authorizeOrderRefund(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await authorizeRefund({
      ownerUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      receiptId: parseActionUuid(field(form, "receiptId"), "Receipt"),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Refund amount",
        1,
        2_147_483_647,
      ),
      reason: field(form, "reason"),
    });
  });
}

export async function authorizeOrderSurplusReturn(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await authorizeSurplusReturn({
      ownerUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      receiptId: parseActionUuid(field(form, "receiptId"), "Receipt"),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Return amount",
        1,
        2_147_483_647,
      ),
      ...(field(form, "reason") ? { reason: field(form, "reason") } : {}),
    });
  });
}

export async function receiveCashPayment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await recordCashReceipt({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      paymentAccountId: parseActionUuid(
        field(form, "accountId"),
        "Payment account",
      ),
      amountCents: parseActionInteger(
        field(form, "amount"),
        "Cash amount",
        1,
        2_147_483_647,
      ),
      tenderedAmountCents: parseActionInteger(
        field(form, "tenderedAmount"),
        "Tendered amount",
        1,
        2_147_483_647,
      ),
      ...(field(form, "payerName")
        ? { payerName: field(form, "payerName") }
        : {}),
    });
  });
}

export async function correctRecordedReceipt(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await correctReceipt({
      ownerUserId: await staffIdentity(),
      receiptId: parseActionUuid(field(form, "receiptId"), "Receipt"),
      deltaAmountCents: parseActionInteger(
        field(form, "delta"),
        "Correction delta",
        -2_147_483_648,
        2_147_483_647,
      ),
      reason: field(form, "reason"),
      ...(field(form, "notes")
        ? { investigationNotes: field(form, "notes") }
        : {}),
    });
  });
}

export async function correctOrderFulfillment(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await correctFulfillment({
      staffUserId: await staffIdentity(),
      orderId: parseActionUuid(field(form, "orderId"), "Order"),
      ...(field(form, "carrier") ? { carrier: field(form, "carrier") } : {}),
      ...(field(form, "trackingNumber")
        ? { trackingNumber: field(form, "trackingNumber") }
        : {}),
      reason: field(form, "reason"),
    });
  });
}

export async function claimOrderPayout(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await claimPayout({
      ownerUserId: await staffIdentity(),
      allocationId: parseActionUuid(
        field(form, "allocationId"),
        "Payout allocation",
      ),
      claimedAmountCents: parseActionInteger(
        field(form, "amount"),
        "Claim amount",
        1,
        2_147_483_647,
      ),
      destination: parseActionDestination(
        field(form, "destinationType"),
        field(form, "destination"),
      ),
    });
  });
}

export async function reconcileOrderPayout(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await reconcilePayout({
      ownerUserId: await staffIdentity(),
      attemptId: parseActionUuid(field(form, "attemptId"), "Payout attempt"),
      actualAmountCents: parseActionInteger(
        field(form, "actualAmount"),
        "Actual payout amount",
        1,
        2_147_483_647,
      ),
      transferReference: field(form, "transferReference"),
      actualDestination: parseActionDestination(
        field(form, "destinationType"),
        field(form, "destination"),
      ),
    });
  });
}

export async function resolveOrderPayoutDiscrepancy(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await resolvePayoutDiscrepancy({
      ownerUserId: await staffIdentity(),
      discrepancyId: parseActionUuid(
        field(form, "discrepancyId"),
        "Payout discrepancy",
      ),
      writeOffCents: parseActionInteger(
        field(form, "writeOff"),
        "Write-off amount",
        0,
        2_147_483_647,
      ),
      resolutionReason: field(form, "reason"),
    });
  });
}

export async function closeOrderPayoutAttempt(form: FormData) {
  return perform(adminReturnPath(form), async () => {
    await closePayoutAttempt({
      ownerUserId: await staffIdentity(),
      attemptId: parseActionUuid(field(form, "attemptId"), "Payout attempt"),
      reason: field(form, "reason"),
    });
  });
}
