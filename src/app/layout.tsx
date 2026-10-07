import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";


export const metadata: Metadata = {
  title: "SupaStore",
  description:
    "Self-hosted, single-merchant online store with manual availability and upfront payment.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="font-sans">
      <body>
        {children}
        <Toaster theme="light" />
      </body>
    </html>
  );
}
