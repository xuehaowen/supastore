import { sql, type SQL } from "drizzle-orm";
import { customers, staffMemberships } from "@/infrastructure/db/schema";

// Membership, including inactive staff, defines staff identity. Email matching
// also covers older customer profiles without a linked authentication user.
export function excludeStaffContacts(email: SQL, authUserId?: SQL) {
  return sql`not exists (
    select 1 from ${staffMemberships}
    where lower(trim(${staffMemberships.email})) = lower(trim(${email}))
    ${authUserId ? sql`or ${staffMemberships.userId} = ${authUserId}` : sql``}
  )`;
}
export function customerDirectoryFilter() {
  return excludeStaffContacts(
    sql`${customers.email}`,
    sql`${customers.authUserId}`,
  );
}
