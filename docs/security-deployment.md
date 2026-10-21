# Security deployment

Apply migrations through `0043_staff_security` before starting the new backend. This adds encrypted staff authenticator records and shared PostgreSQL authentication rate-limit counters. Keep the application database and backups private; protect `BETTER_AUTH_SECRET` independently of database backups. Changing that secret invalidates existing authentication material.

Every staff member should open **Account security**, enter their password, copy the secret into a TOTP authenticator, verify a code and save the single-use recovery codes offline. Enrollment is per account, not mandatory globally. Verify that every active staff member has enrolled before public production. Enabling or disabling the factor revokes previous staff sessions. Disabling requires the password and a recently authenticated staff session. Customer authentication cannot manage staff factors. Lost authenticator and recovery codes require an operator-assisted identity recovery procedure; there is no public MFA reset endpoint.

Run this read-only query against the deployment database; production acceptance requires zero unenrolled active staff:

```sql
SELECT count(*) AS unenrolled_active_staff
FROM staff_memberships AS staff
JOIN "user" AS identity ON identity.id = staff.user_id
WHERE staff.is_active AND NOT identity.two_factor_enabled;
```

The production dependency audit is clean after the Vite 7.3.7 update. The complete development audit still reports the existing `braces` advisory; its locked local patch bounds parser nesting and has normal/adversarial glob tests. Keep that mitigation until an upstream patched release can be verified and adopted; the advisory is not suppressed.

## Trusted ingress

Keep the backend on a private network. Only the storefront should reach it. Place a TLS reverse proxy in front of the storefront and restrict direct access to the storefront port. Set `EDGE_PROXY_SECRET` to a random value of at least 32 bytes in the storefront environment and the proxy's private configuration. The edge must overwrite `X-Supastore-Edge-Token` and `X-Supastore-Client-IP` on every request; use its actual socket peer address, never an incoming forwarded header. Without a verified edge identity the application deliberately uses a shared rate-limit bucket, which can throttle unrelated users.

For an Nginx proxy on the same host, bind the Compose storefront to loopback with `STOREFRONT_BIND=127.0.0.1`. Add these directives to the TLS server's proxy location, replacing the secret placeholder in a private file:

```nginx
client_max_body_size 6m;
client_body_timeout 15s;
proxy_connect_timeout 5s;
proxy_read_timeout 35s;
proxy_pass http://127.0.0.1:3000;
proxy_set_header Host $host;
proxy_set_header X-Supastore-Edge-Token "REPLACE_WITH_RANDOM_PRIVATE_SECRET";
proxy_set_header X-Supastore-Client-IP $remote_addr;
proxy_set_header X-Forwarded-For "";
proxy_set_header X-Forwarded-Proto $scheme;
```

If another load balancer precedes Nginx, configure its trusted proxy ranges explicitly before using its client-address metadata. Add edge connection/request limits suitable for your traffic. Application authentication counters persist across restarts and replicas; they do not replace network abuse controls.

Before accepting production traffic, test that direct backend/storefront access is blocked, forged client-IP headers do not change the rate-limit bucket, distinct real clients have distinct buckets, and repeated sign-in attempts return 429 across backend restarts. Validate HTTPS, response headers, real provider webhooks and backup restoration on the target deployment.

## Response and upload boundaries

Both applications emit anti-framing, content-type, referrer, permissions and HSTS headers. The CSP restricts framing, objects, base URLs and form destinations. It does not implement a nonce-based `script-src`; that requires a separate rendering design and validation. HSTS covers the current host only and becomes effective over HTTPS.

Image and CSV uploads stop reading actual request bytes above 6 MiB, including chunked requests without Content-Length. Individual files still have a 5 MiB limit. Keep the edge body size and timeout limits enabled to bound slow requests before they occupy application connections.
