import { textFor } from "@supastore/i18n/messages";
import { saveAddressAction } from "./customer-actions";
import { Field, Hidden } from "./components";
import { Button } from "@supastore/ui/button";
export function AddressBook({
  locale,
  addresses,
}: {
  locale: string;
  addresses: { id: string; label: string; address: Record<string, string> }[];
}) {
  function fields(saved?: (typeof addresses)[number]) {
    const m = textFor(locale).address;
    return (
      <form action={saveAddressAction} className="mt-4 grid gap-4">
        <Hidden name="locale" value={locale} />
        {saved && <Hidden name="id" value={saved.id} />}
        <Field
          name="label"
          label={textFor(locale).address.label}
          value={saved?.label}
        />
        {[
          { key: "name", label: m.name, required: true },
          { key: "line1", label: m.line1, required: true },
          { key: "line2", label: m.line2 },
          { key: "city", label: m.city, required: true },
          { key: "region", label: m.region },
          { key: "postalCode", label: m.postalCode },
          { key: "country", label: m.country, required: true },
          { key: "phone", label: m.phone },
        ].map((f) => (
          <Field
            key={f.key}
            name={f.key}
            label={f.label}
            required={f.required ?? false}
            value={saved?.address[f.key] ?? (f.key === "country" ? "US" : "")}
          />
        ))}
        <Button type="submit">{textFor(locale).address.save}</Button>
      </form>
    );
  }
  return (
    <>
      <h2>{textFor(locale).address.title}</h2>
      {addresses.map((a) => (
        <div key={a.id} className="border-b py-4">
          <p>
            {a.label}:{" "}
            {[a.address.line1, a.address.city, a.address.country]
              .filter(Boolean)
              .join(", ")}
          </p>
          <details>
            <summary>
              {textFor(locale).address.edit} · {a.label}
            </summary>
            {fields(a)}
          </details>
          <form action={saveAddressAction}>
            <Hidden name="locale" value={locale} />
            <Hidden name="id" value={a.id} />
            <Hidden name="label" value={a.label} />
            <Button name="remove" value="yes" type="submit" variant="outline">
              {textFor(locale).address.remove}
            </Button>
          </form>
        </div>
      ))}
      <details className="mt-4">
        <summary>{textFor(locale).address.add}</summary>
        {fields()}
      </details>
    </>
  );
}
