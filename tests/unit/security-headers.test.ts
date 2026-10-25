import { expect, it } from "vitest";
import { securityHeaders } from "../../packages/config/security-headers.mjs";

it("denies framing and active objects without breaking Next hydration or signed storage", () => {
  const headers = Object.fromEntries(
    securityHeaders.map(({ key, value }) => [key, value]),
  );
  expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  expect(headers["X-Frame-Options"]).toBe("DENY");
  expect(headers["Content-Security-Policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["Content-Security-Policy"]).toContain("object-src 'none'");
  expect(headers["Content-Security-Policy"]).toContain("base-uri 'self'");
  expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000");
});
