import Link from "next/link";

type OperationsSummaryProps = {
  unpaidOrders: number;
  evidenceReviews: number;
  readyForFulfillment: number;
  failedEmails: number;
};

export function OperationsSummary({
  unpaidOrders,
  evidenceReviews,
  readyForFulfillment,
  failedEmails,
}: OperationsSummaryProps) {
  return (
    <div className="metrics" aria-label="Operations summary">
      <Link href="/admin/orders?status=unpaid">
        <strong>{unpaidOrders}</strong>
        Unpaid orders
      </Link>
      <Link href="/admin/payments#evidence">
        <strong>{evidenceReviews}</strong>Evidence review
      </Link>
      <Link href="/admin/fulfillment#ready">
        <strong>{readyForFulfillment}</strong>
        Ready for fulfillment
      </Link>
      <Link href="/admin#emails">
        <strong>{failedEmails}</strong>Failed emails
      </Link>
    </div>
  );
}
