# Server actions

Checkout, settings, catalog, orders, and staff each own their action entry points.
The parent actions.ts preserves existing imports. common.ts contains form-field,
redirect, and error presentation helpers; it is not a client-callable action file.

Actions establish identity, parse form values, invoke application use cases, and
invalidate caches or redirect. Application use cases own authorization, writes,
locks, and audit records. Do not add database mutations here.
