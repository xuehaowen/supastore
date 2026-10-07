/** Immutable accepted-order components. Amounts are currency minor units. */
export interface RewardComponent {
  id: string;
  type: "merchandise" | "tax" | "fulfillment";
  amount: number;
  eligible: boolean;
}

export interface RewardAllocation extends RewardComponent {
  externalAmount: number;
  creditAmount: number;
}

export interface RewardSnapshot {
  policyVersion: string;
  customerId: string | null;
  rateBasisPoints: number;
  allocations: RewardAllocation[];
  basis: number;
  entitlement: number;
}

export interface RewardComponentRefund {
  componentId: string;
  externalCents: number;
  creditCents: number;
}

/** Replay immutable detailed refunds and explicitly identified legacy fallback.
 * Fallback uses remaining original sources, so detailed and legacy refunds
 * together cannot exceed any accepted component/source allocation. */
export function accumulateRewardComponentRefunds(snapshot: RewardSnapshot, refunds: readonly {
  externalCents: number; creditCents: number; componentRefunds?: readonly RewardComponentRefund[] | null;
}[]) {
  const external: Record<string, number> = {};
  const credit: Record<string, number> = {};
  for (const item of snapshot.allocations) { external[item.id] = 0; credit[item.id] = 0; }
  for (const refund of refunds) {
    const externalTotal = minor(refund.externalCents, "external refund");
    const creditTotal = minor(refund.creditCents, "credit refund");
    const details = refund.componentRefunds;
    if (details) {
      const seen = new Set<string>();
      let externalSum = 0n, creditSum = 0n;
      for (const detail of details) {
        if (seen.has(detail.componentId) || !snapshot.allocations.some(item => item.id === detail.componentId))
          throw new Error("Refund component IDs must be known and unique");
        seen.add(detail.componentId);
        externalSum += minor(detail.externalCents, "component external refund");
        creditSum += minor(detail.creditCents, "component credit refund");
        external[detail.componentId] += detail.externalCents;
        credit[detail.componentId] += detail.creditCents;
      }
      if (externalSum !== externalTotal || creditSum !== creditTotal) throw new Error("Component refunds do not match funding sources");
    } else {
      for (const [funding, total, used] of [["externalAmount", externalTotal, external], ["creditAmount", creditTotal, credit]] as const) {
        const allocated = allocateRewardFunding(snapshot.allocations.map(item => ({
          id: item.id, type: item.type, eligible: false, amount: item[funding] - used[item.id],
        })), safe(total));
        for (const item of allocated) used[item.id] += item.externalAmount;
      }
    }
    for (const item of snapshot.allocations) {
      if (external[item.id] > item.externalAmount || credit[item.id] > item.creditAmount)
        throw new RangeError("Refund exceeds original component/source funding");
    }
  }
  return {external, credit};
}

function minor(value: number, name: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  return BigInt(value);
}

function safe(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError("Minor-unit total exceeds safe integer range");
  return Number(value);
}

function rate(value: number): bigint {
  const result = minor(value, "rateBasisPoints");
  if (result > 10000n) throw new RangeError("Reward rate must not exceed 100% ");
  return result;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Exact proportional funding, with lexical type then ID ties independent of locale. */
export function allocateRewardFunding(
  components: readonly RewardComponent[],
  externalAmount: number,
): RewardAllocation[] {
  const seen = new Set<string>();
  const amounts = components.map((component) => {
    if (!component.id || seen.has(component.id)) throw new Error("Component IDs must be unique and nonempty");
    seen.add(component.id);
    if (!["merchandise", "tax", "fulfillment"].includes(component.type)) throw new Error("Invalid component type");
    if (component.type !== "merchandise" && component.eligible) throw new Error("Only merchandise can earn rewards");
    return minor(component.amount, "component amount");
  });
  const total = amounts.reduce((sum, amount) => sum + amount, 0n);
  safe(total);
  const external = minor(externalAmount, "externalAmount");
  if (external > total) throw new RangeError("External funding exceeds payable amount");
  const allocations = amounts.map((amount) => total === 0n ? 0n : external * amount / total);
  let remaining = external - allocations.reduce((sum, amount) => sum + amount, 0n);
  const ranked = components.map((component, index) => ({
    index, component, remainder: total === 0n ? 0n : external * amounts[index] % total,
  })).sort((a, b) => a.remainder !== b.remainder
    ? (a.remainder > b.remainder ? -1 : 1)
    : compare(a.component.type, b.component.type) || compare(a.component.id, b.component.id));
  for (const item of ranked) {
    if (remaining === 0n) break;
    allocations[item.index] += 1n;
    remaining -= 1n;
  }
  return components.map((component, index) => ({
    ...component, externalAmount: safe(allocations[index]), creditAmount: safe(amounts[index] - allocations[index]),
  }));
}

export function createRewardSnapshot(input: {
  policyVersion: string;
  customerId: string | null;
  verified: boolean;
  enabled: boolean;
  rateBasisPoints: number;
  components: readonly RewardComponent[];
  externalAmount: number;
}): RewardSnapshot {
  if (!input.policyVersion) throw new Error("Policy version is required");
  const configuredRate = rate(input.rateBasisPoints);
  const allocations = allocateRewardFunding(input.components, input.externalAmount);
  const effectiveRate = input.enabled && input.verified && input.customerId ? configuredRate : 0n;
  const basis = safe(allocations.reduce((sum, item) => sum + (item.eligible ? BigInt(item.externalAmount) : 0n), 0n));
  return { policyVersion: input.policyVersion, customerId: input.customerId,
    rateBasisPoints: Number(effectiveRate), allocations, basis,
    entitlement: safe(BigInt(basis) * effectiveRate / 10000n) };
}

/** Refund inputs are cumulative external-source amounts, never gross line refunds. */
export function calculateRewardRefundTarget(
  snapshot: RewardSnapshot,
  cumulativeExternalRefunds: Readonly<Record<string, number>>,
  previouslyReversed = 0,
): { remainingBasis: number; targetEntitlement: number; cumulativeReversal: number; incrementalReversal: number } {
  const original = createRewardSnapshot({ ...snapshot, components: snapshot.allocations,
    externalAmount: safe(snapshot.allocations.reduce((sum, item) => sum + minor(item.externalAmount, "external allocation"), 0n)),
    enabled: true, verified: true });
  if (original.entitlement !== snapshot.entitlement || original.basis !== snapshot.basis ||
    original.allocations.some((item, index) => item.externalAmount !== snapshot.allocations[index].externalAmount))
    throw new Error("Invalid reward snapshot");
  const ids = new Set(snapshot.allocations.map((item) => item.id));
  for (const id of Object.keys(cumulativeExternalRefunds)) if (!ids.has(id)) throw new Error("Unknown refund component");
  let remainingBasis = 0n;
  for (const item of snapshot.allocations) {
    const refund = minor(cumulativeExternalRefunds[item.id] ?? 0, "external refund");
    if (refund > BigInt(item.externalAmount)) throw new RangeError("Refund exceeds original component funding");
    if (item.eligible) remainingBasis += BigInt(item.externalAmount) - refund;
  }
  const target = remainingBasis * rate(snapshot.rateBasisPoints) / 10000n;
  const reversal = minor(snapshot.entitlement, "entitlement") - target;
  const previous = minor(previouslyReversed, "previouslyReversed");
  if (previous > reversal) throw new RangeError("Refund history cannot decrease");
  return { remainingBasis: safe(remainingBasis), targetEntitlement: safe(target),
    cumulativeReversal: safe(reversal), incrementalReversal: safe(reversal - previous) };
}

/** Never revoke reserved or unrelated credit; unrecovered entitlement becomes debt. */
export function calculateRewardRevocation(amount: number, affectedLotAvailable: number) {
  const revoked = minor(amount, "revocation");
  const available = minor(affectedLotAvailable, "affectedLotAvailable");
  const recoverable = revoked < available ? revoked : available;
  return { revokedAvailable: safe(recoverable), newDebt: safe(revoked - recoverable) };
}

/** Caller persists a unique recovery identity atomically with associated debt. */
export function recoverRewardDebt(restoredOrEarnedAmount: number, outstandingDebt: number) {
  const amount = minor(restoredOrEarnedAmount, "restoredOrEarnedAmount");
  const debt = minor(outstandingDebt, "outstandingDebt");
  const recovery = amount < debt ? amount : debt;
  return { debtRecovery: safe(recovery), spendableAmount: safe(amount - recovery), remainingDebt: safe(debt - recovery) };
}

/** A release/refund may restore valid and revoked credit together. Only the
 * revoked portion can recover debt associated with that original reward lot.
 * Debt already recovered from later earnings is never recovered again. */
export function recoverRevokedCreditRestore(
  restoredAmount: number,
  restoredRevokedAmount: number,
  associatedOutstandingDebt: number,
) {
  const restored = minor(restoredAmount, "restoredAmount");
  const revoked = minor(restoredRevokedAmount, "restoredRevokedAmount");
  const debt = minor(associatedOutstandingDebt, "associatedOutstandingDebt");
  if (revoked > restored) throw new RangeError("Revoked restoration exceeds total restored credit");
  const recovery = revoked < debt ? revoked : debt;
  return { debtRecovery: safe(recovery), spendableAmount: safe(restored - recovery),
    remainingAssociatedDebt: safe(debt - recovery) };
}

export interface SpendableCreditLot {
  id: string;
  sourceKind: "reward" | "merchant" | "legacy" | "purchased";
  createdAt: string;
  availableAmount: number;
}

/** Reserve these exact lots; capture/release must retain the returned provenance. */
export function allocateCreditLots(lots: readonly SpendableCreditLot[], amount: number) {
  let remaining = minor(amount, "credit amount");
  const ids = new Set<string>();
  const ranked = lots.map((lot) => {
    if (!lot.id || ids.has(lot.id)) throw new Error("Lot IDs must be unique and nonempty");
    ids.add(lot.id);
    if (!["reward", "merchant", "legacy", "purchased"].includes(lot.sourceKind)) throw new Error("Invalid credit source kind");
    const timestamp = Date.parse(lot.createdAt);
    if (!Number.isFinite(timestamp)) throw new Error("Invalid credit lot timestamp");
    return {lot, timestamp, available: minor(lot.availableAmount, "lot available amount")};
  }).sort((a, b) => Number(b.lot.sourceKind === "reward") - Number(a.lot.sourceKind === "reward") ||
    a.timestamp - b.timestamp || compare(a.lot.id, b.lot.id));
  const allocations: {lotId: string; amount: number}[] = [];
  for (const item of ranked) {
    if (remaining === 0n) break;
    const allocated = remaining < item.available ? remaining : item.available;
    if (allocated > 0n) allocations.push({lotId: item.lot.id, amount: safe(allocated)});
    remaining -= allocated;
  }
  if (remaining > 0n) throw new RangeError("Insufficient spendable credit lots");
  return allocations;
}
