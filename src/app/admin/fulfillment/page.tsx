import Operations from "../operations";
export default function FulfillmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <Operations searchParams={searchParams} view="fulfillment" />;
}
