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
      <a href="/admin/orders?status=unpaid">
        <strong>{unpaidOrders}</strong>
        Unpaid orders
      </a>
      <a href="/admin/payments#evidence">
        <strong>{evidenceReviews}</strong>Evidence review
      </a>
      <a href="/admin/fulfillment#ready">
        <strong>{readyForFulfillment}</strong>
        Ready for fulfillment
      </a>
      <a href="/admin/activity">
        <strong>{failedEmails}</strong>Failed emails
      </a>
    </div>
  );
}
