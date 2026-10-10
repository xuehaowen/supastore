export function queuePage(value: string | undefined) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(page) &&
    page > 0 &&
    page <= Math.floor(Number.MAX_SAFE_INTEGER / 50)
    ? page
    : 1;
}

export function QueuePagination({
  query,
  path,
  parameter,
  page,
  hasNext,
}: {
  query: Record<string, string | undefined>;
  path: string;
  parameter: string;
  page: number;
  hasNext: boolean;
}) {
  const href = (next: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && key !== "error") params.set(key, value);
    params.set(parameter, String(next));
    return `${path}?${params}`;
  };
  if (page === 1 && !hasNext) return null;
  return (
    <nav
      aria-label={`${parameter.replace("Page", "")} pagination`}
      className="flex gap-4"
    >
      {page > 1 && <a href={href(page - 1)}>Previous</a>}
      <span>Page {page}</span>
      {hasNext && <a href={href(page + 1)}>Next</a>}
    </nav>
  );
}
