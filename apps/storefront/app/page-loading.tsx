import { textFor } from "@supastore/i18n/messages";

function Placeholder({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded bg-muted motion-safe:animate-pulse ${className}`}
    />
  );
}

export function PageLoadingSkeleton({
  locale,
  kind = "catalog",
}: {
  locale: string;
  kind?: "catalog" | "product" | "checkout";
}) {
  return (
    <section
      className="mx-auto w-full max-w-7xl px-5 py-10 md:px-10"
      data-loading-page={kind}
    >
      <p role="status" className="mb-6 text-sm text-muted-foreground">
        {textFor(locale).design.loading}
      </p>
      <div aria-hidden="true" aria-busy="true">
        <Placeholder className="mb-4 h-4 w-32" />
        <Placeholder className="mb-10 h-10 w-2/3 max-w-md" />
        {kind === "catalog" ? (
          <>
            <Placeholder className="mb-8 h-12 w-full" />
            <div className="grid grid-cols-2 gap-5 md:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index}>
                  <Placeholder className="mb-4 aspect-square w-full" />
                  <Placeholder className="mb-3 h-4 w-4/5" />
                  <Placeholder className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          </>
        ) : (
          <div
            className={`grid gap-10 ${kind === "product" ? "md:grid-cols-2" : "md:grid-cols-[1.5fr_1fr]"}`}
          >
            {kind === "product" ? (
              <Placeholder className="aspect-square w-full" />
            ) : (
              <div className="grid gap-6">
                {Array.from({ length: 6 }, (_, index) => (
                  <Placeholder key={index} className="h-14 w-full" />
                ))}
              </div>
            )}
            <div className="space-y-6">
              <Placeholder className="h-8 w-1/2" />
              <Placeholder className="h-20 w-full" />
              <Placeholder className="h-12 w-full" />
              <Placeholder className="h-12 w-full" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
