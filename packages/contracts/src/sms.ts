/** The supported SMS program is transactional order updates, not marketing. */
export const SMS_CONSENT_VERSION = "order-updates-v1";
export type SmsPolicy = { enabled: boolean; reviewed: boolean };
type Merchant = {
  storeName: string;
  supportEmail: string;
  defaultLocale?: string;
  publicContent?: Partial<Record<string, { privacy?: string; terms?: string }>>;
  smsPolicy?: SmsPolicy;
};
export function smsReadiness(store: Merchant | undefined) {
  const issues: string[] = [];
  if (!store?.storeName.trim()) issues.push("Set the store name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(store?.supportEmail || ""))
    issues.push("Set a valid support email.");
  for (const key of ["privacy", "terms"] as const) {
    const content =
      store?.publicContent?.[store.defaultLocale || "en"]?.[key]?.trim();
    if (!content || /\[[^\]]+\]|\{[^}]+\}/.test(content))
      issues.push(
        `Publish a completed ${key === "privacy" ? "Privacy Policy" : "Terms"} page in the default store language.`,
      );
  }
  if (!store?.smsPolicy?.reviewed)
    issues.push(
      "Review the policies, SMS disclosures and messaging practices.",
    );
  return {
    ready: issues.length === 0,
    enabled: issues.length === 0 && store?.smsPolicy?.enabled === true,
    issues,
  };
}
export function smsDisclosure(
  store: Pick<Merchant, "storeName">,
  locale = "en",
) {
  return locale === "zh"
    ? `我同意接收 ${store.storeName} 的订单更新短信。短信频率不定，可能产生短信和数据费用。回复 STOP 退订，回复 HELP 获取帮助。同意接收短信并非购买条件。您的手机信息不会出售或分享给第三方用于促销或营销目的。`
    : `I agree to receive SMS order updates from ${store.storeName}. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. Your mobile information will not be sold or shared with third parties for promotional or marketing purposes.`;
}
export function smsConsentCurrent(
  store: Merchant | undefined,
  preference:
    { consentText: string; consentVersion: string; locale: string } | undefined,
) {
  return Boolean(
    store &&
    smsReadiness(store).enabled &&
    preference &&
    preference.consentVersion === SMS_CONSENT_VERSION &&
    preference.consentText === smsDisclosure(store, preference.locale),
  );
}
export function smsKeywordMessages(
  store: Pick<Merchant, "storeName" | "supportEmail">,
) {
  return {
    START: `${store.storeName}: You're opted in to receive updates about your order. Msg frequency varies. Msg&data rates may apply. Consent is not a condition of purchase. Reply STOP to opt out, HELP for help.`,
    STOP: `${store.storeName}: You are unsubscribed and will receive no further messages.`,
    HELP: `${store.storeName}: For help, contact ${store.supportEmail}. Reply STOP to opt out.`,
  };
}
/** Starters require merchant completion and review before publication. */
export function starterPolicies(
  store: Pick<Merchant, "storeName" | "supportEmail">,
) {
  return {
    privacy: `${store.storeName} — Privacy Policy\nEffective date: [Enter date]\n\nWe collect the contact, order and fulfillment information you provide to process purchases and support customers. [Describe your actual data collection, payment providers, cookies, retention and customer privacy rights.]\n\nSMS order updates\nYour mobile information will not be sold or shared with third parties for promotional or marketing purposes. SMS opt-in data and consent will not be shared for purposes unrelated to providing the messaging service. We may share this information with service providers that help deliver our text messages.\n\nContact: ${store.supportEmail}`,
    terms: `${store.storeName} — Terms of Service\nEffective date: [Enter date]\n\n[Describe your purchase, payment, fulfillment, cancellation, return and refund terms, and applicable business details.]\n\nSMS order updates\nYou may optionally subscribe to text messages about your orders. Consent is not a condition of purchase. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out or HELP for help. See our Privacy Policy for how we handle mobile information and consent.\n\nSupport: ${store.supportEmail}`,
  };
}
