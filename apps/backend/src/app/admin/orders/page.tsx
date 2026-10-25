import Operations from "../operations";
export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <Operations searchParams={searchParams} view="orders" />;
}
