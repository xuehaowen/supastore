import { PLATFORM_NAME } from "@supastore/contracts";
import defaults from "./default-templates.json";
import { emailLayout } from "./email-layout";
import { DomainError } from "@/application/common/errors";
import type {
  EmailMessage,
  SmsMessage,
} from "@/application/ports/notifications";

export type TemplateKey = {
  event: string;
  channel: "email" | "sms";
  audience: "customer" | "staff";
  locale: "en" | "zh";
};
export type TemplateContent = { subject: string; body: string };
const orderVariables = [
  "store.name",
  "support.email",
  "order.reference",
  "order.url",
  "order.total",
  "order.received",
  "order.balance",
  "fulfillment.pickup",
  "fulfillment.tracking",
];
type EventDefinition = {
  label: string;
  audiences: TemplateKey["audience"][];
  sms: boolean;
  variables: string[];
  required: string[];
};
const orderEvent = (
  label: string,
  sms = false,
  staff = false,
): EventDefinition => ({
  label,
  audiences: staff ? ["customer", "staff"] : ["customer"],
  sms,
  variables: orderVariables,
  required: ["order.reference", "order.url"],
});
export const notificationEvents: Record<string, EventDefinition> = {
  "order.submitted": orderEvent("Order placed", false, true),
  "order.confirmed": orderEvent("Payment confirmed", true),
  "order.cancelled": orderEvent("Order cancelled", true),
  "order.completed": orderEvent("Order completed", true),
  "order.change_proposed": orderEvent("Order change proposed"),
  "order.change_accepted": orderEvent("Order change accepted"),
  "order.change_invalidated": orderEvent("Order change withdrawn", false, true),
  "order.access_recovery": {
    ...orderEvent("Order access recovery"),
    variables: ["store.name", "support.email", "order.reference", "action.url"],
    required: ["order.reference", "action.url"],
  },
  "payment.evidence_uploaded": orderEvent(
    "Payment evidence received",
    false,
    true,
  ),
  "fulfillment.updated": orderEvent("Tracking updated"),
  "fulfillment.shipped": orderEvent("Order dispatched", true),
  "fulfillment.out_for_delivery": orderEvent("Out for delivery", true),
  "fulfillment.ready_for_pickup": orderEvent("Ready for pickup", true),
  "fulfillment.pickup_reminder": orderEvent("Pickup reminder", true),
  "fulfillment.completed": orderEvent("Fulfillment complete", true),
  "return.requested": orderEvent("Return requested", false, true),
  "return.approved": orderEvent("Return approved"),
  "return.rejected": orderEvent("Return rejected"),
  "return.cancelled": orderEvent("Return cancelled"),
  "return.received": orderEvent("Returned goods received"),
  "auth.reset_password": {
    label: "Password reset",
    audiences: ["customer"],
    sms: false,
    variables: ["store.name", "support.email", "action.url"],
    required: ["action.url"],
  },
  "auth.email_verification": {
    label: "Account email verification",
    audiences: ["customer"],
    sms: false,
    variables: ["store.name", "support.email", "action.url"],
    required: ["action.url"],
  },
  "store.email_verification": {
    label: "Store email verification",
    audiences: ["staff"],
    sms: false,
    variables: ["store.name", "support.email", "action.url"],
    required: ["action.url"],
  },
  "sales.threshold_reached": {
    label: "Sales threshold reached",
    audiences: ["staff"],
    sms: false,
    variables: [
      "store.name",
      "support.email",
      "sales.total",
      "sales.threshold",
      "sales.period",
      "sales.url",
    ],
    required: ["sales.total", "sales.threshold", "sales.url"],
  },
};
export function templateKey(key: TemplateKey) {
  return [key.event, key.channel, key.audience, key.locale].join(":");
}
export function requiredTemplates(): TemplateKey[] {
  return Object.entries(notificationEvents).flatMap(([event, definition]) =>
    definition.audiences.flatMap((audience) =>
      (["en", "zh"] as const).flatMap((locale) => {
        const keys: TemplateKey[] = [
          { event, channel: "email", audience, locale },
        ];
        if (definition.sms && audience === "customer")
          keys.push({ event, channel: "sms", audience, locale });
        return keys;
      }),
    ),
  );
}
export function definitionFor(key: TemplateKey) {
  const definition = notificationEvents[key.event];
  if (
    !definition ||
    !definition.audiences.includes(key.audience) ||
    !["en", "zh"].includes(key.locale) ||
    !["email", "sms"].includes(key.channel) ||
    (key.channel === "sms" && (!definition.sms || key.audience !== "customer"))
  )
    throw new DomainError(
      "Unsupported notification template combination.",
      "TEMPLATE_UNKNOWN_EVENT",
    );
  return definition;
}
export function templateCoverage(published: TemplateKey[]) {
  const present = new Set(published.map(templateKey));
  return requiredTemplates().filter((key) => !present.has(templateKey(key)));
}
export function defaultTemplate(key: TemplateKey): TemplateContent {
  definitionFor(key);
  const copy = (
    defaults as Record<
      string,
      Record<
        string,
        { subject: string; body: string; sms?: string; staffBody?: string }
      >
    >
  )[key.event]?.[key.locale];
  if (!copy) throw new DomainError("Default notification template is missing.");
  return {
    subject: key.channel === "sms" ? "" : copy.subject,
    body:
      key.channel === "sms"
        ? copy.sms || ""
        : key.audience === "staff"
          ? copy.staffBody || copy.body
          : copy.body,
  };
}
function variablesIn(value: string) {
  const variables: string[] = [];
  const remainder = value.replace(
    /\{\{\s*([a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*)\s*\}\}/g,
    (_match, variable: string) => {
      variables.push(variable);
      return "";
    },
  );
  if (/[{}]/.test(remainder))
    throw new DomainError(
      "Use only simple variables such as {{order.reference}}. Template logic is not supported.",
    );
  return variables;
}
export function validateTemplate(key: TemplateKey, content: TemplateContent) {
  const definition = definitionFor(key);
  if (
    typeof content.subject !== "string" ||
    typeof content.body !== "string" ||
    !content.body.trim() ||
    content.body.length > (key.channel === "sms" ? 500 : 12000)
  )
    throw new DomainError("Template body is empty or too long.");
  if (
    /[\r\n\u0000-\u001f\u007f]/.test(content.subject) ||
    content.subject.length > 200 ||
    (key.channel === "email" && !content.subject.trim()) ||
    (key.channel === "sms" && content.subject)
  )
    throw new DomainError(
      "Email subjects must be a single line of at most 200 characters; SMS has no subject.",
    );
  const used = [...variablesIn(content.subject), ...variablesIn(content.body)];
  if (used.some((variable) => !definition.variables.includes(variable)))
    throw new DomainError("Template contains an unsupported variable.");
  const required =
    key.channel === "sms" ? ["order.reference"] : definition.required;
  if (
    required.some((variable) => !variablesIn(content.body).includes(variable))
  )
    throw new DomainError(
      `Template body must include: ${required.map((v) => `{{${v}}}`).join(", ")}.`,
    );
  if (key.channel === "sms" && !/\bSTOP\b/.test(content.body))
    throw new DomainError("SMS must include STOP unsubscribe instructions.");
  return content;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
export function renderTemplate(
  key: TemplateKey,
  content: TemplateContent,
  values: Record<string, string>,
  deliveryId: string,
  recipient: string,
): EmailMessage | SmsMessage {
  validateTemplate(key, content);
  const substitute = (text: string) =>
    text.replace(
      /\{\{\s*([a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*)\s*\}\}/g,
      (_match, variable: string) => {
        if (typeof values[variable] !== "string" || !values[variable])
          throw new DomainError(`Missing notification value: ${variable}.`);
        return values[variable];
      },
    );
  const text = substitute(content.body);
  if (key.channel === "sms") {
    if (text.length > 500)
      throw new DomainError("Rendered SMS exceeds 500 characters.");
    return { deliveryId, to: recipient, text };
  }
  const subject = substitute(content.subject);
  if (subject.length > 200 || /[\r\n\u0000-\u001f\u007f]/.test(subject))
    throw new DomainError("Rendered email subject is invalid.");
  const storeName = values["store.name"] || "";
  const renderHtml = (source: string) =>
    escapeHtml(source).replace(
      /\{\{\s*([a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*)\s*\}\}/g,
      (_match, variable: string) => {
        const value = values[variable]!;
        if (["action.url", "order.url", "sales.url"].includes(variable)) {
          const url = new URL(value);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.username ||
            url.password
          )
            throw new DomainError("Notification link is invalid.");
          return `<a href="${escapeHtml(url.href)}" style="color:#1d4ed8;word-break:break-all">${escapeHtml(value)}</a>`;
        }
        return escapeHtml(value);
      },
    );
  return {
    deliveryId,
    to: recipient,
    subject,
    text,
    html: emailLayout({
      key,
      subject,
      body: content.body,
      storeName,
      render: renderHtml,
      escape: escapeHtml,
    }),
  };
}
export function previewValues(): Record<string, string> {
  return {
    "store.name": PLATFORM_NAME,
    "support.email": "support@example.test",
    "order.reference": "SP-PREVIEW",
    "order.url": "https://store.example/en/recover",
    "order.total": "$32.00",
    "order.received": "$20.00",
    "order.balance": "$12.00",
    "fulfillment.pickup": "123 Example Street · October 12, 2026 · 10:00–11:00",
    "fulfillment.tracking": "Example carrier · TRACK-PREVIEW",
    "action.url": "https://store.example/example-link",
    "sales.total": "$1,250.00",
    "sales.threshold": "$1,000.00",
    "sales.period": "2026-01-01 – 2027-01-01",
    "sales.url": "https://store.example/admin/reports",
  };
}
