import { saveAddressAction } from "@/app/customer-actions";
import { Field, Hidden } from "@/app/components";
import { Button } from "@/components/ui/button";
export function AddressBook({
  locale,
  addresses,
}: {
  locale: string;
  addresses: { id: string; label: string; address: Record<string, string> }[];
}) {
  function fields(saved?: (typeof addresses)[number]) {
    return (
      <form action={saveAddressAction} className="mt-4 grid gap-4">
        <Hidden name="locale" value={locale} />
        {saved && <Hidden name="id" value={saved.id} />}
        <Field name="label" label="Address label" value={saved?.label} />
        {[
          { key: "name", label: "Recipient name", required: true },
          { key: "line1", label: "Address line 1", required: true },
          { key: "line2", label: "Address line 2" },
          { key: "city", label: "City", required: true },
          { key: "region", label: "Region" },
          { key: "postalCode", label: "Postal code" },
          { key: "country", label: "Country code", required: true },
          { key: "phone", label: "Phone" },
        ].map((f) => (
          <Field
            key={f.key}
            name={f.key}
            label={f.label}
            required={f.required ?? false}
            value={saved?.address[f.key] ?? (f.key === "country" ? "US" : "")}
          />
        ))}
        <Button type="submit">Save address</Button>
      </form>
    );
  }
  return (
    <>
      <h2>Address book</h2>
      {addresses.map((a) => (
        <div key={a.id} className="border-b py-4">
          <p>
            {a.label}:{" "}
            {[a.address.line1, a.address.city, a.address.country]
              .filter(Boolean)
              .join(", ")}
          </p>
          <details>
            <summary>Edit address · {a.label}</summary>
            {fields(a)}
          </details>
          <form action={saveAddressAction}>
            <Hidden name="locale" value={locale} />
            <Hidden name="id" value={a.id} />
            <Hidden name="label" value={a.label} />
            <Button name="remove" value="yes" type="submit" variant="outline">
              Remove address
            </Button>
          </form>
        </div>
      ))}
      <details className="mt-4">
        <summary>Add address</summary>
        {fields()}
      </details>
    </>
  );
}
