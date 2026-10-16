import Link from "next/link";
import { AdminNav } from "./admin-nav";

export default function AdminNotFound() {
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <section className="panel admin-state">
          <p className="eyebrow">Page not found</p>
          <h1>This record is unavailable</h1>
          <p>
            The page may have moved, or the record may no longer exist. Choose a
            section from the menu or return to the overview.
          </p>
          <Link href="/admin">Back to overview</Link>
        </section>
      </main>
    </>
  );
}
