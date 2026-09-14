import Operations from "../operations";
export default function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <Operations searchParams={searchParams} view="payments" />;
}
