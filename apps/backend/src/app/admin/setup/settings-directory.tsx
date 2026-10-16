import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@supastore/ui/table";

const settings = [
  [
    "#store-profile",
    "Store profile & taxes",
    "Name, support email, logo, currency, language, timezone, and tax settings.",
  ],
  [
    "#shipping",
    "Shipping zones",
    "Country and regional rates, priorities, and free shipping thresholds.",
  ],
  [
    "#pickup",
    "Pickup locations",
    "Addresses, preparation time, opening hours, and capacity.",
  ],
  [
    "#payment-methods",
    "Payment methods & email delivery",
    "Receiving accounts, payment instructions, and owner email delivery verification.",
  ],
  [
    "#staff-access",
    "Team & access",
    "Staff roles, active access, and membership removal.",
  ],
  [
    "/admin/settings/delivery",
    "Local delivery areas",
    "Delivery coverage, rates, and scheduling rules.",
  ],
  [
    "/admin/settings/commerce",
    "Checkout & rewards",
    "Guest checkout, fulfillment availability, and reward policies.",
  ],
  [
    "/admin/settings/content",
    "Store information & policies",
    "Customer-facing store information and policies.",
  ],
  [
    "/admin/settings/notifications",
    "Notifications",
    "Email and SMS templates and notification history.",
  ],
  [
    "/admin/translations",
    "Languages & translations",
    "Translated storefront content.",
  ],
  [
    "/admin/activity",
    "Activity history",
    "Review recorded changes and staff actions.",
  ],
];

export function SettingsDirectory() {
  return (
    <section className="panel" aria-labelledby="settings-directory-heading">
      <h2 id="settings-directory-heading">Manage your store</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Section</TableHead>
            <TableHead>What you can manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {settings.map(([href, label, description]) => (
            <TableRow key={href}>
              <TableCell>
                <Link href={href}>{label}</Link>
              </TableCell>
              <TableCell>{description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
