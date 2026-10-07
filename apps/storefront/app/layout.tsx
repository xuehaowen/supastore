import "./style.css";
import { publicOrigin } from "../lib/seo";
export const metadata = {
  metadataBase: new URL(publicOrigin()),
  title: { default: "Store", template: "%s" },
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
