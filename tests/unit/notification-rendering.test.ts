import { describe, expect, it } from "vitest";
import {
  renderEmail,
  renderOrderEmail,
} from "@/application/notifications/render-message";
describe("provider-independent email content", () => {
  it("renders allowed fields without leaking arbitrary event payload data", () => {
    const result = renderEmail({
      deliveryId: "delivery-1",
      recipient: "buyer@example.test",
      subject: "Order update",
      template: "order.confirmed",
      data: {
        referenceCode: "ABC",
        purchaseTotalCents: 1234,
        secret: "private-provider-token",
        nested: { password: "private" },
      },
    });
    expect(result.text).toContain("purchaseTotalCents: 1234");
    expect(result.text).toContain("referenceCode: ABC");
    expect(result.text).not.toContain("private");
    expect(result.to).toBe("buyer@example.test");
  });
  it("preserves return subjects and renders verification links as prepared content", () => {
    expect(
      renderOrderEmail("id", "buyer@example.test", "return.received", {
        referenceCode: "ABC",
      }).subject,
    ).toBe("Product return update · ABC");
    const result = renderEmail({
      deliveryId: "id",
      recipient: "buyer@example.test",
      subject: "Verify",
      template: "auth.verification",
      data: {
        verificationUrl: "https://store.example/verify?token=test",
        token: "hidden",
      },
    });
    expect(result.text).toContain(
      "verificationUrl: https://store.example/verify?token=test",
    );
    expect(result.text).not.toContain("token: hidden");
  });
});
