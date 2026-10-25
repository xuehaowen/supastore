import "./admin.css";
import "./workspace-polish.css";
import { db } from "@/infrastructure/db";
import { storeSettings } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { ForbiddenError, UnauthorizedError } from "@/application/common/errors";
import { WorkspaceProvider } from "./workspace-context";
export const dynamic = "force-dynamic";
export const metadata = {
  title: { default: "Store admin", template: "%s · Store admin" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await (async () => {
    try {
      const staff = await staffIdentity();
      return await db.transaction((tx) => verifyStaffInTransaction(tx, staff));
    } catch (error) {
      if (error instanceof UnauthorizedError || error instanceof ForbiddenError)
        return null;
      throw error;
    }
  })();
  const [store] = member ? await db.select().from(storeSettings).limit(1) : [];
  return (
    <WorkspaceProvider
      owner={member?.role === "owner"}
      currency={store?.currency ?? "USD"}
      precision={store?.precision ?? 2}
    >
      <div className="admin-workspace">
        {member && (
          <a className="admin-skip-link" href="#admin-content">
            Skip to content
          </a>
        )}
        {children}
      </div>
    </WorkspaceProvider>
  );
}
