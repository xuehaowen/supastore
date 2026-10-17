const actions = [
  {
    key: "settings",
    label: "Complete your store profile",
    href: "/admin/setup#store-profile",
    description:
      "Save your store identity, support email, currency and timezone.",
  },
  {
    key: "products",
    label: "Publish your first available product",
    href: "/admin/products",
    description: "Add a product, price and available variant, then publish it.",
  },
  {
    key: "fulfillment",
    label: "Configure how customers receive orders",
    href: "/admin/settings/commerce",
    description:
      "Enable your intended fulfillment method and configure its locations, areas or shipping zones.",
  },
  {
    key: "payment",
    label: "Set up a payment method",
    href: "/admin/setup#payment-methods",
    description:
      "Activate the payment method you intend to offer and check its instructions.",
  },
  {
    key: "templates",
    label: "Publish required email templates",
    href: "/admin/settings/notifications",
    description:
      "Review the missing email templates so order and account messages can be sent.",
  },
  {
    key: "email",
    label: "Verify email delivery",
    href: "/admin/setup#payment-methods",
    description:
      "Send the verification email and follow its link to confirm delivery.",
  },
] as const;

export function launchGuidance(
  checklist: readonly { key: string; isReady: boolean }[],
) {
  return (
    actions.find((action) =>
      checklist.some((item) => item.key === action.key && !item.isReady),
    ) ?? null
  );
}
