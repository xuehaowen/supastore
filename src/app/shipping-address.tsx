import { countryOptions, stateOptions } from "@/domain/shipping-destination";

export function ShippingAddress({
  address,
  locale,
}: {
  address: {
    address: string;
    country: string;
    region?: string;
    postalCode?: string;
  };
  locale: string;
}) {
  const country =
    countryOptions(locale).find((item) => item.code === address.country)
      ?.name ?? address.country;
  const region =
    address.country === "US"
      ? (stateOptions(locale).find(([code]) => code === address.region)?.[1] ??
        address.region)
      : address.region;
  return (
    <p>
      {[address.address, region, address.postalCode, country]
        .filter(Boolean)
        .join(", ")}
    </p>
  );
}
