"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Input } from "@supastore/ui/input";
import { AdminDialog } from "./admin-dialog";
import { visibleAdminNavigation } from "./navigation";
import { useWorkspace } from "./workspace-context";

export function QuickNavigation() {
  const { owner } = useWorkspace();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setOpen(false);
    setSearch("");
  }, [pathname]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const pages = visibleAdminNavigation(owner)
    .flatMap((group) =>
      group.sections.flatMap((section) =>
        (
          section.children ?? [{ href: section.href, label: section.label }]
        ).map((page) => ({ ...page, section: section.label })),
      ),
    )
    .filter((page) =>
      `${page.section} ${page.label}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  return (
    <AdminDialog
      trigger="Go to page"
      title="Go to page"
      description="Find a section of your store. Shortcut: Ctrl or Command + K."
      open={open}
      onOpenChange={setOpen}
    >
      <label className="grid gap-2">
        Search admin pages
        <Input
          ref={input}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Orders, inventory, delivery…"
        />
      </label>
      <nav
        className="quick-navigation-results"
        aria-label="Matching admin pages"
      >
        {pages.map((page) => (
          <Link key={page.href} href={page.href} onClick={() => setOpen(false)}>
            <strong>{page.label}</strong>
            <span>{page.section}</span>
          </Link>
        ))}
        {!pages.length && (
          <p className="admin-empty">
            No pages match. Try a section name such as Products or Settings.
          </p>
        )}
      </nav>
    </AdminDialog>
  );
}
