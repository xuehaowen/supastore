import Operations from "./operations";
export default function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <Operations searchParams={searchParams} />;
}
