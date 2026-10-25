import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/infrastructure/db";
import { user } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { SecurityForm } from "./security-form";
import { AdminNav } from "@/app/admin/admin-nav";

export default async function SecurityPage() {
  const identity = await staffIdentity().catch(() => redirect("/admin/login"));
  const enabled = await db.transaction(async (tx) => {
    await verifyStaffInTransaction(tx, identity);
    const [record] = await tx
      .select({ enabled: user.twoFactorEnabled })
      .from(user)
      .where(eq(user.id, identity));
    return record?.enabled ?? false;
  });
  return (
    <>
      <AdminNav />
      <main id="admin-content" tabIndex={-1} className="admin">
        <h1 className="text-2xl font-semibold">Account security</h1>
        <p>
          Protect staff access with an authenticator app. Store recovery codes
          somewhere private, outside this browser.
        </p>
        <SecurityForm enabled={enabled} />
      </main>
    </>
  );
}
