import { Input } from "@supastore/ui/input";
import { Button } from "@supastore/ui/button";
import type { PlacementKind } from "@/application/use-cases/catalog/change-catalog-placement";
import { saveCatalogPlacement } from "./catalog-placement-action";

export function CatalogPlacement({
  kind,
  id,
  scopeId,
  name,
  position,
  pinned,
  context = {},
}: {
  kind: PlacementKind;
  id: string;
  scopeId?: string;
  name: string;
  position: number | null;
  pinned: boolean;
  context?: Record<string, string>;
}) {
  const automatic = kind === "product" || kind === "category-product";
  return (
    <form
      action={saveCatalogPlacement}
      className="catalog-placement-controls flex max-w-md flex-wrap items-center gap-2"
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="scopeId" value={scopeId ?? ""} />
      <input type="hidden" name="expectedPosition" value={position ?? "auto"} />
      <input type="hidden" name="expectedPinned" value={String(pinned)} />
      {Object.entries(context).map(([key, value]) => (
        <input key={key} type="hidden" name={key} value={value} />
      ))}
      <Input
        className="w-24"
        name="position"
        type="number"
        min={0}
        max={1000000}
        step={1}
        defaultValue={position ?? ""}
        placeholder={automatic ? "Auto" : undefined}
        aria-label={`Storefront order · ${name}`}
      />
      <Button
        type="submit"
        name="operation"
        value="save"
        variant="outline"
        size="sm"
        aria-label={`Save order · ${name}`}
      >
        Save order
      </Button>
      <Button
        type="submit"
        name="operation"
        value="up"
        variant="ghost"
        size="sm"
        aria-label={`Move ${name} up`}
        title="Move up within the same pin group"
      >
        ↑
      </Button>
      <Button
        type="submit"
        name="operation"
        value="down"
        variant="ghost"
        size="sm"
        aria-label={`Move ${name} down`}
        title="Move down within the same pin group"
      >
        ↓
      </Button>
      <Button
        type="submit"
        name="operation"
        value="top"
        variant="outline"
        size="sm"
        aria-label={`Move ${name} to top`}
        title="Move to top within the same pin group"
      >
        Move to top
      </Button>
      <Button
        type="submit"
        name="operation"
        value={pinned ? "unpin" : "pin"}
        variant={pinned ? "secondary" : "outline"}
        size="sm"
        aria-label={`${pinned ? "Unpin" : "Pin"} ${name}`}
      >
        {pinned ? "Unpin" : "Pin"}
      </Button>
    </form>
  );
}
