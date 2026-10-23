import { Skeleton } from "@supastore/ui/skeleton";
export default function Loading() {
  return (
    <div className="py-12" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-24" />
      <Skeleton className="mb-10 h-14 w-2/3" />
      <div className="storefront-product-grid">
        {[0, 1, 2].map((key) => (
          <div key={key}>
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="mt-4 h-5 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
