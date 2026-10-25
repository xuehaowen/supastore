import { textFor } from "@supastore/i18n/messages";
import { saveAddressAction } from "./customer-actions";
import { Hidden } from "./components";
import { CustomerField as Field } from "./customer-field";
import { CustomerForm, CustomerSelect } from "./customer-form";
import { countryOptions } from "@supastore/shipping/destination";
import { CustomerSubmit as Button } from "./customer-submit";
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
      <CustomerForm
        locale={locale}
        action={saveAddressAction}
        className="mt-4 grid gap-4"
      >
        <Hidden name="locale" value={locale} />
        {saved && <Hidden name="id" value={saved.id} />}
        <Field
          name="label"
          label={textFor(locale).address.label}
          value={saved?.label}
          maxLength={80}
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
        ].map((f) =>
          f.key === "country" ? (
            <label key={f.key} className="grid gap-2">
              {textFor(locale).country}
              <CustomerSelect
                name="country"
                required
                autoComplete="shipping country"
                defaultValue={saved?.address.country || "US"}
              >
                {countryOptions(locale).map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </CustomerSelect>
            </label>
          ) : (
            <Field
              key={f.key}
              name={f.key}
              type={f.key === "phone" ? "tel" : "text"}
              label={f.label}
              required={f.required ?? false}
              value={saved?.address[f.key] ?? (f.key === "country" ? "US" : "")}
              maxLength={200}
              autoComplete={
                (
                  {
                    name: "shipping name",
                    line1: "shipping address-line1",
                    line2: "shipping address-line2",
                    city: "shipping address-level2",
                    region: "shipping address-level1",
                    postalCode: "shipping postal-code",
                    country: "shipping country",
                    phone: "shipping tel",
                  } as Record<string, string>
                )[f.key]
              }
            />
          ),
        )}
        <Button locale={locale}>{textFor(locale).address.save}</Button>
      </CustomerForm>
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
            <Button locale={locale} name="remove" value="yes" variant="outline">
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
