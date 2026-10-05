"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function BulkVariantEditor({
  productId,
  revision,
  variants,
  action,
}: {
  productId: string;
  revision: number;
  variants: {
    id: string;
    title: string;
    sku: string;
    priceCents: number;
    isAvailable: boolean;
  }[];
  action: (form: FormData) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [availability, setAvailability] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const validPrice =
    price === "" || (/^\d+$/.test(price) && Number(price) <= 2147483647);
  const canReview =
    selected.length > 0 && validPrice && (price !== "" || availability !== "");
  return (
    <section className="panel product-editor-wide">
      <h2>Bulk variant changes</h2>
      <p>
        Select variants and review the exact changes before applying them.
        Prices use integer minor units.
      </p>
      <form
        action={async (form) => {
          setPending(true);
          try {
            await action(form);
          } finally {
            setPending(false);
          }
        }}
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="revision" value={revision} />
        {selected.map((id) => (
          <input key={id} type="hidden" name="variantIds" value={id} />
        ))}
        <input type="hidden" name="priceCents" value={price} />
        <input type="hidden" name="availability" value={availability} />
        {!reviewing ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={
                  selected.length === variants.length && variants.length > 0
                }
                onChange={(e) =>
                  setSelected(e.target.checked ? variants.map((v) => v.id) : [])
                }
              />
              Select all variants
            </label>
            <div className="grid gap-2 my-4">
              {variants.map((v) => (
                <label key={v.id} className="check">
                  <input
                    type="checkbox"
                    checked={selected.includes(v.id)}
                    onChange={(e) =>
                      setSelected((current) =>
                        e.target.checked
                          ? [...current, v.id]
                          : current.filter((id) => id !== v.id),
                      )
                    }
                  />
                  {v.title} · {v.sku} · {v.priceCents} ·{" "}
                  {v.isAvailable ? "Available" : "Unavailable"}
                </label>
              ))}
            </div>
            <label className="grid gap-2">
              New price in minor units (blank keeps current prices)
              <input
                className="border rounded p-2"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label className="grid gap-2 my-4">
              New availability
              <select
                className="border rounded p-2"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
              >
                <option value="">Keep current availability</option>
                <option value="true">Available</option>
                <option value="false">Unavailable</option>
              </select>
            </label>
            {!validPrice && (
              <p role="alert">Enter a whole number between 0 and 2147483647.</p>
            )}
            <Button
              type="button"
              disabled={!canReview}
              onClick={() => setReviewing(true)}
            >
              Review bulk changes
            </Button>
          </>
        ) : (
          <>
            <h3>Review {selected.length} variants</h3>
            <ul className="my-4">
              {variants
                .filter((v) => selected.includes(v.id))
                .map((v) => (
                  <li key={v.id}>
                    {v.sku}: price {v.priceCents} → {price || v.priceCents};
                    availability {v.isAvailable ? "Available" : "Unavailable"} →{" "}
                    {availability === ""
                      ? v.isAvailable
                        ? "Available"
                        : "Unavailable"
                      : availability === "true"
                        ? "Available"
                        : "Unavailable"}
                  </li>
                ))}
            </ul>
            <p className="mb-4">
              Existing orders retain their purchased prices and variant
              identity.
            </p>
            <div className="flex gap-3">
              <Button type="submit" disabled={pending}>
                Apply bulk changes
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setReviewing(false)}
              >
                Back to selection
              </Button>
            </div>
          </>
        )}
      </form>
    </section>
  );
}
