import { describe, expect, it } from "vitest";
import {
  notificationEvents,
  requiredTemplates,
  defaultTemplate,
  validateTemplate,
  renderTemplate,
  templateCoverage,
  previewValues,
} from "@/application/notifications/templates";

describe("notification template contracts", () => {
  it("renders every seeded template with sample values in its own language/channel", () => {
    for (const key of requiredTemplates()) {
      const message = renderTemplate(
        key,
        defaultTemplate(key),
        previewValues(),
        "preview",
        "preview@example.test",
      );
      expect(message.text).not.toContain("{{");
      expect(message.text.length).toBeGreaterThan(10);
      expect("subject" in message).toBe(key.channel === "email");
    }
  });
  it("provides valid English and Chinese defaults for every required event/channel/audience", () => {
    for (const key of requiredTemplates())
      expect(() => validateTemplate(key, defaultTemplate(key))).not.toThrow();
    expect(templateCoverage(requiredTemplates())).toEqual([]);
    expect(notificationEvents["auth.reset_password"]).toBeTruthy();
    expect(notificationEvents["return.rejected"]).toBeTruthy();
  });
  it("reports the exact missing combinations instead of falling back to a generic notification", () => {
    const keys = requiredTemplates();
    expect(templateCoverage(keys.slice(1))).toEqual([keys[0]]);
  });
  it.each([
    "{{password}}",
    "{{order.total | eval}}",
    "{{#if order.total}}",
    "{{order.reference",
    "{{constructor}}",
  ])("rejects unsupported template expressions %s", (body) => {
    expect(() =>
      validateTemplate(
        {
          event: "order.confirmed",
          channel: "email",
          audience: "customer",
          locale: "en",
        },
        { subject: "Order", body },
      ),
    ).toThrow();
  });
  it("requires the password-reset link and prevents subject header injection", () => {
    const key = {
      event: "auth.reset_password",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    expect(() =>
      validateTemplate(key, { subject: "Reset", body: "No link" }),
    ).toThrow();
    expect(() =>
      validateTemplate(key, {
        subject: "Reset\nBcc: victim@example.test",
        body: "{{action.url}}",
      }),
    ).toThrow();
  });
  it("requires SMS unsubscribe instructions and bounds SMS copy", () => {
    const key = {
      event: "order.confirmed",
      channel: "sms",
      audience: "customer",
      locale: "en",
    } as const;
    expect(() =>
      validateTemplate(key, { subject: "", body: "{{order.reference}}" }),
    ).toThrow();
    expect(() =>
      validateTemplate(key, {
        subject: "",
        body: "STOP {{order.reference}} " + "a".repeat(501),
      }),
    ).toThrow();
  });
  it("escapes all HTML, renders only allowed variables and never recursively evaluates customer values", () => {
    const key = {
      event: "order.confirmed",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    const result = renderTemplate(
      key,
      {
        subject: "Order {{order.reference}}",
        body: "{{store.name}}\n{{order.reference}}\n{{order.url}}",
      },
      {
        "store.name": "<script>alert(1)</script>",
        "order.reference": "{{password}}",
        "order.url": "https://store.example/en/recover",
      },
      "delivery",
      "customer@example.test",
    );
    expect(result.text).toContain("{{password}}");
    expect("html" in result && result.html).not.toContain("<script>");
    expect("html" in result && result.html).toContain("&lt;script&gt;");
  });
  it("fails visibly when a referenced value is absent, rather than sending broken placeholders", () => {
    const key = {
      event: "auth.reset_password",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    expect(() =>
      renderTemplate(
        key,
        defaultTemplate(key),
        {},
        "delivery",
        "customer@example.test",
      ),
    ).toThrow();
  });
  it("renders action links as clickable escaped anchors and rejects unsafe schemes", () => {
    const key = {
      event: "auth.reset_password",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    const content = { subject: "Reset", body: "{{action.url}}" };
    const safe = renderTemplate(
      key,
      content,
      { "action.url": "https://store.example/reset?token=one&locale=en" },
      "delivery",
      "buyer@example.test",
    );
    expect("html" in safe && safe.html).toContain(
      '<a href="https://store.example/reset?token=one&amp;locale=en"',
    );
    expect(() =>
      renderTemplate(
        key,
        content,
        { "action.url": "javascript:alert(1)" },
        "delivery",
        "buyer@example.test",
      ),
    ).toThrow();
  });
  it("rejects unsupported combinations and oversized or empty copy", () => {
    const key = {
      event: "order.confirmed",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    expect(() => defaultTemplate({ ...key, event: "unknown.event" })).toThrow();
    expect(() => defaultTemplate({ ...key, audience: "staff" })).toThrow();
    expect(() =>
      validateTemplate(key, {
        subject: "",
        body: "{{order.reference}} {{order.url}}",
      }),
    ).toThrow();
    expect(() =>
      validateTemplate(key, {
        subject: "a".repeat(201),
        body: "{{order.reference}} {{order.url}}",
      }),
    ).toThrow();
    expect(() =>
      validateTemplate(key, { subject: "Order", body: "a".repeat(12001) }),
    ).toThrow();
    expect(() =>
      validateTemplate(key, { subject: "Order", body: " " }),
    ).toThrow();
    expect(() =>
      validateTemplate(
        { ...key, channel: "sms" },
        { subject: "SMS subject", body: "{{order.reference}} STOP" },
      ),
    ).toThrow();
  });
  it("rejects rendered SMS/subject overflow, line breaks and credential-bearing links", () => {
    const key = {
      event: "order.confirmed",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    const content = {
      subject: "{{store.name}}",
      body: "{{order.reference}} {{order.url}}",
    };
    expect(() =>
      renderTemplate(
        key,
        content,
        { ...previewValues(), "store.name": "bad\nsubject" },
        "id",
        "buyer@example.test",
      ),
    ).toThrow();
    expect(() =>
      renderTemplate(
        key,
        content,
        { ...previewValues(), "store.name": "a".repeat(201) },
        "id",
        "buyer@example.test",
      ),
    ).toThrow();
    expect(() =>
      renderTemplate(
        key,
        content,
        {
          ...previewValues(),
          "order.url": "https://user:password@store.example/order",
        },
        "id",
        "buyer@example.test",
      ),
    ).toThrow();
    expect(() =>
      renderTemplate(
        { ...key, channel: "sms" },
        { subject: "", body: "{{order.reference}} STOP" },
        { "order.reference": "a".repeat(500) },
        "id",
        "+15550100000",
      ),
    ).toThrow();
  });
});
