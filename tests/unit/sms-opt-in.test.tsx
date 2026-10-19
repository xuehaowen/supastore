import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SmsOptIn } from "../../apps/storefront/app/sms-opt-in";
describe("SMS consent form", () => {
  it("renders an optional, unchecked consent control, phone field and live policy URLs", () => {
    const html = renderToStaticMarkup(
      <SmsOptIn
        storeName="Supastore"
        locale="en"
        available
        source="checkout"
      />,
    );
    expect(html).toContain('type="tel"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('required=""');
    expect(html).toContain("/en/pages/privacy");
    expect(html).toContain("/en/pages/terms");
    expect(html).toContain("Supastore");
    expect(html).toContain('name="smsPreferenceId" value=""');
    expect(html).not.toContain("<form");
  });
  it("explains unavailable verification without requiring SMS for purchasing", () => {
    const html = renderToStaticMarkup(
      <SmsOptIn
        storeName="Supastore"
        locale="en"
        available={false}
        source="sms-page"
      />,
    );
    expect(html).toContain("place an order without SMS");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('name="smsPreferenceId"');
  });
});
