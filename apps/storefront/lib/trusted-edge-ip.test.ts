import { afterEach, expect, it, vi } from "vitest";
import { trustedEdgeClientIP } from "./trusted-edge-ip";
const secret = "synthetic-edge-secret-at-least-32-characters";
function incoming(ip: string, token = secret) {
  return new Headers({
    "x-supastore-edge-token": token,
    "x-supastore-client-ip": ip,
  });
}
afterEach(() => vi.unstubAllEnvs());
it("accepts only an authenticated edge supplying one valid IPv4 or IPv6 address", () => {
  expect(trustedEdgeClientIP(incoming("192.0.2.1"), secret)).toBe("192.0.2.1");
  expect(trustedEdgeClientIP(incoming("2001:db8::1"), secret)).toBe(
    "2001:db8::1",
  );
});
it("is disabled by default and rejects missing, short or mismatched tokens", () => {
  vi.stubEnv("EDGE_PROXY_SECRET", "");
  expect(trustedEdgeClientIP(incoming("192.0.2.1"))).toBeNull();
  expect(
    trustedEdgeClientIP(incoming("192.0.2.1", "short"), "short"),
  ).toBeNull();
  expect(
    trustedEdgeClientIP(
      incoming("192.0.2.1", "x".repeat(secret.length)),
      secret,
    ),
  ).toBeNull();
  expect(
    trustedEdgeClientIP(incoming("192.0.2.1", "wrong"), secret),
  ).toBeNull();
  expect(
    trustedEdgeClientIP(
      new Headers({ "x-supastore-client-ip": "192.0.2.1" }),
      secret,
    ),
  ).toBeNull();
});
it("rejects chained, malformed, port-bearing and scoped addresses", () => {
  for (const ip of [
    "192.0.2.1, 192.0.2.2",
    "unknown",
    "192.0.2.1:80",
    "[2001:db8::1]",
    "fe80::1%eth0",
    "999.1.1.1",
    "",
  ]) {
    expect(trustedEdgeClientIP(incoming(ip), secret)).toBeNull();
  }
});
