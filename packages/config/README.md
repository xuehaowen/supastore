# Shared server configuration

Dependency-free configuration helpers used by both services. Callers supply environment values explicitly; helpers never read credentials or import application infrastructure.

Public origin resolution uses STOREFRONT_ORIGIN, APP_URL, then BETTER_AUTH_URL. Development defaults to http://localhost:3001 (or STOREFRONT_PORT); production requires an explicit public origin. URLs must use HTTP(S) and cannot contain credentials.

Backend origin validation is shared by storefront rewrite configuration and the runtime proxy. BACKEND_URL must be a bare HTTP(S) origin without credentials, path, query or fragment; it defaults to http://127.0.0.1:3000.
