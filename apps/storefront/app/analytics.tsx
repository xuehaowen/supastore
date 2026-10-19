"use client";
import { getStorefrontMessages } from "../lib/i18n";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  analyticsEndpoint,
  analyticsPayload,
  sendAnalytics,
  analyticsConsent,
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_CONSENT_EVENT,
  trackPurchase,
} from "../lib/analytics";
import type { StorefrontMessages } from "../lib/i18n";
export function AnalyticsPreference({
  locale,
  messages,
}: {
  locale: string;
  messages?: StorefrontMessages["analytics"];
}) {
  const path = usePathname();
  const [choice, setChoice] = useState<string | null>(null);
  const m = messages ?? getStorefrontMessages(locale).analytics;
  useEffect(() => {
    const update = () => setChoice(analyticsConsent());
    update();
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, []);
  useEffect(() => {
    if (choice === "yes") {
      const payload = analyticsPayload(path);
      if (payload) void sendAnalytics(payload);
    }
  }, [path, choice]);
  if (!analyticsEndpoint() || choice === null) return null;
  function choose(value: "yes" | "no" | "pending") {
    try {
      if (value === "pending") localStorage.removeItem(ANALYTICS_CONSENT_KEY);
      else localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
      setChoice(value);
      window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
    } catch {
      setChoice("no");
    }
  }
  return (
    <aside aria-label={m.changePreference} className="border-t py-4 text-sm">
      <p>{m.notice}</p>
      {choice === "pending" ? (
        <>
          <button onClick={() => choose("yes")}>{m.allow}</button>
          <button onClick={() => choose("no")}>{m.decline}</button>
        </>
      ) : (
        <button onClick={() => choose("pending")}>{m.changePreference}</button>
      )}
    </aside>
  );
}
export function PurchaseAnalytics({
  orderId,
  total,
  currency,
}: {
  orderId: string;
  total: number;
  currency: string;
}) {
  useEffect(() => {
    const track = () => {
      void trackPurchase(orderId, total, currency);
    };
    track();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, track);
    window.addEventListener("storage", track);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, track);
      window.removeEventListener("storage", track);
    };
  }, [orderId, total, currency]);
  return null;
}
