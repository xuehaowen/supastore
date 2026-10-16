# Authentication and staff checks

Better Auth configuration/client integration and active staff verification.

## When working here

A session is not staff permission. Recheck active membership and required role for private merchant operations.

Customer authentication uses `/api/auth`, `supastore-customer` cookies and the `session` table. Staff authentication uses `/api/admin-auth`, `supastore-staff` cookies and `staff_session`. The instances derive separate signing secrets from `BETTER_AUTH_SECRET` and do not cache session identity in cookies. Tokens, session lists and ordinary logout cannot cross these boundaries, even for the same user. Customer sessions require verified email; staff session creation requires active membership. The staff HTTP endpoint exposes only sign-in, session read and sign-out, with no public registration.

User/password records remain shared. Password reset revokes both session tables for the identity. Owner recovery writes/signs only a staff session. Migration `0038_staff_sessions` must be applied before staff login. Both audiences must sign in again after this change; legacy cookies are not promoted or reused. No additional authentication secret is required.

## Where to start

- [index.ts](index.ts): Server authentication configuration and hooks.
- [client.ts](client.ts): Browser authentication client using the current public origin.
- [session.ts](session.ts): In-transaction active staff and owner checks.

## More context

[Parent overview](../README.md)
