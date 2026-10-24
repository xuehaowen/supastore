import { Input } from "@supastore/ui/input";
import { Button } from "@supastore/ui/button";
import { saveNavigationOrder } from "./navigation-order-action";

export function NavigationOrder({
  kind,
  id,
  name,
  position,
  search,
  page,
}: {
  kind: "category" | "collection";
  id: string;
  name: string;
  position: number;
  search: string;
  page: number;
}) {
  return (
    <form
      action={saveNavigationOrder}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedPosition" value={position} />
      <input type="hidden" name="q" value={search} />
      <input type="hidden" name="page" value={page} />
      <Input
        className="w-24"
        name="position"
        type="number"
        min={0}
        max={1000000}
        step={1}
        required
        defaultValue={position}
        aria-label={`Storefront order · ${name}`}
      />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        aria-label={`Save order · ${name}`}
      >
        Save order
      </Button>
    </form>
  );
}
