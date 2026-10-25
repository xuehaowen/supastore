import { describe, expect, it } from "vitest";
import {
  defaultTemplate,
  previewValues,
  renderTemplate,
} from "@/application/notifications/templates";
describe("provider-independent email content", () => {
  it("preserves custom instructions, escapes details and retains a usable URL fallback", () => {
    const key = {
      event: "order.confirmed",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    const result = renderTemplate(
      key,
      {
        subject: "Your order",
        body: "Merchant instructions stay here.\n\nOrder: {{order.reference}}\nTotal: {{order.total}}\n\n{{order.url}}\n\nSpecial footer instructions.",
      },
      {
        ...previewValues(),
        "order.reference": "<script>bad</script>\nNext line",
      },
      "id",
      "buyer@example.test",
    );
    if (!("html" in result)) throw new Error("Expected email");
    expect(result.html).toContain("Merchant instructions stay here.");
    expect(result.html).toContain("Special footer instructions.");
    expect(result.html).toContain(
      "&lt;script&gt;bad&lt;/script&gt;<br>Next line",
    );
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain(">https://store.example/en/recover</a>");
    expect(result.text).toContain("Special footer instructions.");
  });
  it.each(["en", "zh"] as const)(
    "structures %s email with one action and matching text",
    (locale) => {
      const key = {
        event: "auth.reset_password",
        channel: "email",
        audience: "customer",
        locale,
      } as const;
      const result = renderTemplate(
        key,
        defaultTemplate(key),
        previewValues(),
        "id",
        "buyer@example.test",
      );
      expect("html" in result).toBe(true);
      if (!("html" in result)) return;
      expect(result.html).toContain('role="presentation"');
      expect(result.html).toContain('name="viewport"');
      expect(result.html).toContain('data-email-action="primary"');
      expect(result.html.match(/data-email-action="primary"/g)).toHaveLength(1);
      expect(result.html).toContain(
        locale === "en" ? "Reset password" : "重设密码",
      );
      expect(result.text).toContain(previewValues()["action.url"]);
      expect(result.html).toContain("support@example.test");
      expect(result.html).not.toContain("SP-PREVIEW");
    },
  );
  it("renders allowed fields without leaking arbitrary event payload data", () => {
    const key = {
      event: "order.confirmed",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    const result = renderTemplate(
      key,
      defaultTemplate(key),
      {
        ...previewValues(),
        "order.reference": "ABC",
        "order.total": "$12.34",
        secret: "private-provider-token",
      },
      "delivery-1",
      "buyer@example.test",
    );
    expect(result.text).toContain("$12.34");
    expect(result.text).toContain("ABC");
    expect(result.text).not.toContain("private");
    expect(result.to).toBe("buyer@example.test");
  });
  it("preserves return subjects and renders verification links as prepared content", () => {
    const key = {
      event: "return.received",
      channel: "email",
      audience: "customer",
      locale: "en",
    } as const;
    const returned = renderTemplate(
      key,
      defaultTemplate(key),
      { ...previewValues(), "order.reference": "ABC" },
      "id",
      "buyer@example.test",
    );
    expect("subject" in returned && returned.subject).toBe(
      "Returned goods received · ABC",
    );
    const authKey = { ...key, event: "auth.email_verification" };
    const result = renderTemplate(
      authKey,
      defaultTemplate(authKey),
      {
        ...previewValues(),
        "action.url": "https://store.example/verify?token=test",
        token: "hidden",
      },
      "id",
      "buyer@example.test",
    );
    expect(result.text).toContain("https://store.example/verify?token=test");
    expect(result.text).not.toContain("token: hidden");
  });
});
