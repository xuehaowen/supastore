"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  analyticsEndpoint,
  analyticsPayload,
  sendAnalytics,
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
  const m = messages;
  useEffect(() => {
    try {
      setChoice(localStorage.getItem("store-analytics-consent") || "pending");
    } catch {
      setChoice("no");
    }
  }, []);
  useEffect(() => {
    if (choice === "yes") {
      const payload = analyticsPayload(path);
      if (payload) sendAnalytics(payload);
    }
  }, [path, choice]);
  if (!analyticsEndpoint()) return null;
  return (
    <aside>
      <p>
        {m?.notice ??
          "Optional store analytics records public page visits and purchase amounts without names, emails or order references."}
      </p>
      {choice === "pending" ? (
        <>
          <button
            onClick={() => {
              try {
                localStorage.setItem("store-analytics-consent", "yes");
                setChoice("yes");
              } catch {
                setChoice("no");
              }
            }}
          >
            {m?.allow ?? "Allow analytics"}
          </button>
          <button
            onClick={() => {
              try {
                localStorage.setItem("store-analytics-consent", "no");
              } catch {}
              setChoice("no");
            }}
          >
            {m?.decline ?? "Decline"}
          </button>
        </>
      ) : (
        <button
          onClick={() => {
            try {
              localStorage.removeItem("store-analytics-consent");
            } catch {}
            setChoice("pending");
          }}
        >
          {m?.changePreference ?? "Change analytics preference"}
        </button>
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
    if (!analyticsEndpoint()) return;
    try {
      if (localStorage.getItem("store-analytics-consent") !== "yes") return;
      const key = `store-purchase-analytics:${orderId}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "sent");
      sendAnalytics({ event: "purchase", amount: total, currency });
    } catch {}
  }, [orderId, total, currency]);
  return null;
}
