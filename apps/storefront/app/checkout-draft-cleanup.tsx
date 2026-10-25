"use client";

import { useEffect } from "react";
import { consumeCheckoutDraft } from "../lib/checkout-draft";

export function CheckoutDraftCleanup({ token }: { token: string }) {
  useEffect(() => {
    try {
      consumeCheckoutDraft(sessionStorage, token);
      const url = new URL(window.location.href);
      url.searchParams.delete("placed");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* Storage restrictions must not interrupt the order page. */
    }
  }, [token]);
  return null;
}
