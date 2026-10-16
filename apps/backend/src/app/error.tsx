"use client";
import { textFor } from "@supastore/i18n/messages";
import { Button } from "@supastore/ui/button";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const m = textFor("en").common;
  return (
    <main className="narrow standalone panel">
      <h1>{m.unavailableTitle}</h1>
      <p>{m.retryMessage}</p>
      <Button onClick={reset}>{m.retry}</Button>
      <Link href="/admin">Back to admin</Link>
    </main>
  );
}
