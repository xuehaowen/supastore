"use client";

import Link from "next/link";
import { Button } from "@supastore/ui/button";
import { AdminNav } from "./admin-nav";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <>
      <AdminNav />
      <main tabIndex={-1} id="admin-content" className="admin">
        <section className="panel admin-state">
          <p className="eyebrow">Workspace unavailable</p>
          <h1>This page could not be loaded</h1>
          <p>
            Try loading the page again. If the problem continues, return to the
            overview and try another section.
          </p>
          <div className="admin-page-actions">
            <Button onClick={reset}>Try again</Button>
            <Link href="/admin">Back to overview</Link>
          </div>
        </section>
      </main>
    </>
  );
}
