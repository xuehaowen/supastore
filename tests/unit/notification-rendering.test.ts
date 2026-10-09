import { describe, expect, it } from "vitest";
import {
  defaultTemplate,
  previewValues,
  renderTemplate,
} from "@/application/notifications/templates";
describe("provider-independent email content", () => {
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
