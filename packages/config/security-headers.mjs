// Baseline protections compatible with Next's streamed inline hydration and signed assets.
// A strict script-src policy needs per-response nonces and is not implied by this policy.
export const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value:
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
  },
  // Browsers honor HSTS only over HTTPS; do not force includeSubDomains/preload on merchant domains.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];
