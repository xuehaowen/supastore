import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
