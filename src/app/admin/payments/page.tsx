import Operations from "../operations";
export default function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    paymentQ?: string;
    paymentStatus?: string;
    paymentType?: string;
    paymentPage?: string;
    manage?: string;
    managePayment?: string;
  }>;
}) {
  return <Operations searchParams={searchParams} view="payments" />;
}
