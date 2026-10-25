export function canPlaceQuotedOrder(input: {
  totalPayableCents: number;
  hasPayment: boolean;
  onlinePayment: boolean;
  availableCreditCents: number;
}) {
  return (
    input.totalPayableCents === 0 ||
    input.hasPayment ||
    input.onlinePayment ||
    input.availableCreditCents >= input.totalPayableCents
  );
}
