import { describe, expect, it } from "vitest";
import { notificationEvents, requiredTemplates, defaultTemplate, validateTemplate, renderTemplate, templateCoverage } from "@/application/notifications/templates";

describe("notification template contracts", () => {
  it("provides valid English and Chinese defaults for every required event/channel/audience", () => {
    for (const key of requiredTemplates()) expect(() => validateTemplate(key, defaultTemplate(key))).not.toThrow();
    expect(templateCoverage(requiredTemplates())).toEqual([]);
    expect(notificationEvents["auth.reset_password"]).toBeTruthy();
    expect(notificationEvents["return.rejected"]).toBeTruthy();
  });
  it("reports the exact missing combinations instead of falling back to a generic notification", () => {
    const keys = requiredTemplates();
    expect(templateCoverage(keys.slice(1))).toEqual([keys[0]]);
  });
  it.each(["{{password}}", "{{order.total | eval}}", "{{#if order.total}}", "{{order.reference", "{{constructor}}"])("rejects unsupported template expressions %s", (body) => {
    expect(() => validateTemplate({ event: "order.confirmed", channel: "email", audience: "customer", locale: "en" }, { subject: "Order", body })).toThrow();
  });
  it("requires the password-reset link and prevents subject header injection", () => {
    const key = { event: "auth.reset_password", channel: "email", audience: "customer", locale: "en" } as const;
    expect(() => validateTemplate(key, { subject: "Reset", body: "No link" })).toThrow();
    expect(() => validateTemplate(key, { subject: "Reset\nBcc: victim@example.test", body: "{{action.url}}" })).toThrow();
  });
  it("requires SMS unsubscribe instructions and bounds SMS copy", () => {
    const key = { event: "order.confirmed", channel: "sms", audience: "customer", locale: "en" } as const;
    expect(() => validateTemplate(key, { subject: "", body: "{{order.reference}}" })).toThrow();
    expect(() => validateTemplate(key, { subject: "", body: "STOP {{order.reference}} " + "a".repeat(501) })).toThrow();
  });
  it("escapes all HTML, renders only allowed variables and never recursively evaluates customer values", () => {
    const key = { event: "order.confirmed", channel: "email", audience: "customer", locale: "en" } as const;
    const result = renderTemplate(key, { subject: "Order {{order.reference}}", body: "{{store.name}}\n{{order.reference}}\n{{order.url}}" }, { "store.name": "<script>alert(1)</script>", "order.reference": "{{password}}", "order.url": "https://store.example/en/recover" }, "delivery", "customer@example.test");
    expect(result.text).toContain("{{password}}");
    expect("html" in result && result.html).not.toContain("<script>");
    expect("html" in result && result.html).toContain("&lt;script&gt;");
  });
  it("fails visibly when a referenced value is absent, rather than sending broken placeholders", () => {
    const key = { event: "auth.reset_password", channel: "email", audience: "customer", locale: "en" } as const;
    expect(() => renderTemplate(key, defaultTemplate(key), {}, "delivery", "customer@example.test")).toThrow();
  });
});
