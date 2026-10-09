// Shared destination data and validation; safe for either storefront and server.
import { customerMessages, sharedMessages } from "../../i18n/src/customer";
const countries =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );

export function countryOptions(locale: string) {
  const names = new Intl.DisplayNames([locale === "zh" ? "zh" : "en"], {
    type: "region",
  });
  return countries
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export const usStates = Object.entries(sharedMessages.en.stateNames);

export interface ShippingDestinationRule {
  countryCodes: string[] | null;
  regionCodes: string[];
  postalPrefixes: string[];
}

export function stateOptions(locale: string) {
  const names = customerMessages(locale).stateNames as Record<string, string>;
  return usStates.map(([code, name]) => [code, names[code] ?? name] as const);
}

export type FulfillmentMethod = "shipping" | "pickup" | "local_delivery";

export function availableFulfillment(
  policy:
    | {
        shippingEnabled?: boolean;
        pickupEnabled?: boolean;
        deliveryEnabled?: boolean;
      }
    | undefined,
  configured: { shipping: number; pickup: number; delivery: number },
): FulfillmentMethod[] {
  const methods: FulfillmentMethod[] = [];
  if ((policy?.shippingEnabled ?? true) && configured.shipping > 0)
    methods.push("shipping");
  if ((policy?.pickupEnabled ?? true) && configured.pickup > 0)
    methods.push("pickup");
  if ((policy?.deliveryEnabled ?? false) && configured.delivery > 0)
    methods.push("local_delivery");
  return methods;
}

export function validShippingRegion(country: string, region: string) {
  return (
    /^[A-Z0-9]{1,12}$/.test(region) &&
    (country !== "US" || usStates.some(([code]) => code === region))
  );
}

export function shippingRequiredFields(
  rules: ShippingDestinationRule[],
  country: string,
) {
  const applicable = rules.filter(
    (r) => r.countryCodes === null || r.countryCodes.includes(country),
  );
  return {
    region: applicable.some((r) => r.regionCodes.length > 0),
    postalCode: applicable.some((r) => r.postalPrefixes.length > 0),
  };
}
