import "./style.css";
import { publicOrigin } from "../lib/seo";
import { headers } from "next/headers";
import { getStorefrontMessages } from "../lib/i18n";
export async function generateMetadata() {
  const locale = (await headers()).get("x-store-locale") ?? "en";
  return {
    metadataBase: new URL(publicOrigin()),
    title: {
      default: getStorefrontMessages(locale).common.storeTitle,
      template: "%s",
    },
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = (await headers()).get("x-store-locale") === "zh" ? "zh" : "en";
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
