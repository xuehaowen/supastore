import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@supastore/ui/sonner";
import { headers } from "next/headers";
import { textFor } from "@supastore/i18n/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await headers()).get("x-store-locale") ?? "en";
  return {
    title: "SupaStore",
    description: textFor(locale).common.storeDescription,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = (await headers()).get("x-store-locale") === "zh" ? "zh" : "en";
  return (
    <html lang={locale} className="font-sans">
      <body>
        {children}
        <Toaster theme="light" />
      </body>
    </html>
  );
}
