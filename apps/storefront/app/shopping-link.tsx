"use client";

import NextLink, { useLinkStatus } from "next/link";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { PageLoadingSkeleton } from "./page-loading";

type Pending = { id: string; kind: "catalog" | "product" | "checkout" } | null;
const Loading = createContext<{
  pending: Pending;
  setPending: Dispatch<SetStateAction<Pending>>;
} | null>(null);

export function ShoppingLoadingProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending>(null);
  return (
    <Loading.Provider value={{ pending, setPending }}>
      {children}
    </Loading.Provider>
  );
}

export function ShoppingContent({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string;
}) {
  const loading = useContext(Loading);
  useEffect(() => {
    if (loading?.pending)
      document.getElementById("main")?.focus({ preventScroll: true });
  }, [loading?.pending]);
  return (
    <>
      {loading?.pending && (
        <PageLoadingSkeleton locale={locale} kind={loading.pending.kind} />
      )}
      <div hidden={Boolean(loading?.pending)}>{children}</div>
    </>
  );
}

function PendingLink({ kind }: { kind: NonNullable<Pending>["kind"] }) {
  const { pending } = useLinkStatus();
  const loading = useContext(Loading);
  const id = useId();
  const setPending = loading?.setPending;
  useEffect(() => {
    if (!pending || !setPending) return;
    setPending({ id, kind });
    return () => setPending((current) => (current?.id === id ? null : current));
  }, [pending, setPending, id, kind]);
  return null;
}

export default function ShoppingLink({
  children,
  ...props
}: ComponentProps<typeof NextLink>) {
  const href =
    typeof props.href === "string" ? props.href : props.href.pathname || "";
  const kind = /\/products\//.test(href)
    ? "product"
    : /\/checkout(?:\?|$)/.test(href)
      ? "checkout"
      : "catalog";
  const shopping =
    /^\/(en|zh)(?:$|\?|\/(?:search|products|categories|collections|checkout)(?:\/|\?|$))/.test(
      href,
    );
  return (
    <NextLink {...props}>
      {children}
      {shopping && <PendingLink kind={kind} />}
    </NextLink>
  );
}
