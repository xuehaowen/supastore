import { describe, expect, it } from "vitest";
import {
  smsReadiness,
  smsDisclosure,
  smsKeywordMessages,
  starterPolicies,
  smsConsentCurrent,
  SMS_CONSENT_VERSION,
} from "../../packages/contracts/src/sms";

const store = {
  storeName: "Example Store",
  supportEmail: "help@example.com",
  defaultLocale: "en",
  publicContent: {
    en: { privacy: "Our privacy practices", terms: "Our terms" },
  },
  smsPolicy: { enabled: true, reviewed: true },
};
describe("merchant SMS setup", () => {
  it("requires fresh consent after a brand or disclosure version changes", () => {
    const preference = {
      consentText: smsDisclosure(store),
      consentVersion: SMS_CONSENT_VERSION,
      locale: "en",
    };
    expect(smsConsentCurrent(store, preference)).toBe(true);
    expect(
      smsConsentCurrent({ ...store, storeName: "Another Store" }, preference),
    ).toBe(false);
    expect(
      smsConsentCurrent(store, { ...preference, consentVersion: "retired" }),
    ).toBe(false);
    expect(smsConsentCurrent(undefined, preference)).toBe(false);
    expect(smsConsentCurrent(store, undefined)).toBe(false);
  });
  it("requires merchant identity, published policies and merchant review", () => {
    expect(smsReadiness(store).ready).toBe(true);
    for (const changed of [
      { storeName: "" },
      { supportEmail: "" },
      { publicContent: {} },
      { smsPolicy: { enabled: true, reviewed: false } },
      { publicContent: { en: { privacy: "[Business name]", terms: "Terms" } } },
    ])
      expect(smsReadiness({ ...store, ...changed }).ready).toBe(false);
    expect(
      smsReadiness({ ...store, smsPolicy: { enabled: false, reviewed: true } })
        .enabled,
    ).toBe(false);
  });
  it("names the merchant, limits consent to order updates and contains all disclosures", () => {
    const text = smsDisclosure(store);
    for (const phrase of [
      "Example Store",
      "order updates",
      "frequency varies",
      "rates may apply",
      "STOP",
      "HELP",
      "not a condition of purchase",
      "sold or shared",
      "marketing purposes",
    ])
      expect(text).toContain(phrase);
    expect(text).not.toContain("Milky");
    expect(smsDisclosure(store, "zh")).toContain("STOP");
  });
  it("generates brand-specific keyword replies and editable policy starters", () => {
    const replies = smsKeywordMessages(store);
    expect(replies.START).toContain("Msg&data rates may apply");
    expect(replies.START).toContain("Consent is not a condition of purchase");
    expect(replies.STOP).toContain("Example Store");
    expect(replies.HELP).toContain("help@example.com");
    expect(starterPolicies(store).privacy).toContain("sold or shared");
    expect(starterPolicies(store).terms).toContain("STOP");
  });
});
