import { countryOptions, stateOptions } from "@supastore/shipping/destination";

export function ShippingAddress({
  address,
  locale,
}: {
  address: {
    address: string;
    recipientName?: string;
    line2?: string;
    city?: string;
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
      {[
        address.recipientName,
        address.address,
        address.line2,
        address.city,
        region,
        address.postalCode,
        country,
      ]
        .filter(Boolean)
        .join(", ")}
    </p>
  );
}
