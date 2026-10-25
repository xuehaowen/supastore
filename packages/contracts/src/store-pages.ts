export const storePageKeys = [
  "about",
  "support",
  "shipping",
  "returns",
  "privacy",
  "terms",
] as const;
export type StorePageKey = (typeof storePageKeys)[number];
type StoreContent = {
  defaultLocale: string;
  publicContent: Partial<
    Record<"en" | "zh", Partial<Record<StorePageKey, string>>>
  >;
};
const defaultContent = {
  en: {
    about:
      "Welcome to our store. Browse our catalog for product details, available options, and current prices. Visit Support for help with your purchase.",
    support:
      "Need help with a product or order? Contact the store using the email below. For an existing order, include your order reference and describe how we can help. You can also review your orders in your account or use order recovery.",
    shipping:
      "Available delivery and pickup options, charges, and scheduling are shown at checkout. Review these details before placing your order. Contact the store with your order reference for help with fulfillment.",
    returns:
      "Contact the store before returning an item. Include your order reference, the item, and the reason for your request so the store can explain the applicable return and refund process.",
    privacy:
      "The storefront uses contact, account, and order information to provide shopping and order services. Contact the store for details about its privacy practices or to ask about your personal information. Optional analytics preferences can be managed on this site.",
    terms:
      "Review the product details, selected options, price, payment instructions, and fulfillment details before placing an order. Keep your order reference. Contact the store for its full terms or for questions about cancellations, changes, or refunds.",
  },
  zh: {
    about:
      "欢迎光临。请浏览商品目录，了解商品详情、可选款式及当前价格。如需购物帮助，请访问客户支持页面。",
    support:
      "需要商品或订单帮助？请通过下方邮箱联系商店。如已有订单，请提供订单编号并说明您的问题。您也可以在账户中查看订单，或使用订单找回功能。",
    shipping:
      "可用的配送、自提方式、费用和时间安排将在结账时显示。请在下单前核对。如需履约帮助，请提供订单编号联系商店。",
    returns:
      "退货前请先联系商店，提供订单编号、商品及申请原因，以了解适用的退货和退款流程。",
    privacy:
      "本店使用联系、账户及订单信息提供购物和订单服务。如需了解商店的隐私处理方式或咨询个人信息事宜，请联系商店。您可以在本站管理可选的分析偏好。",
    terms:
      "下单前请核对商品详情、所选款式、价格、付款说明以及配送或自提信息，并保留订单编号。如需完整条款，或咨询取消、修改及退款事宜，请联系商店。",
  },
};
export function storePageContent(
  store: StoreContent,
  locale: "en" | "zh",
  key: StorePageKey,
) {
  return (
    store.publicContent[locale]?.[key]?.trim() ||
    store.publicContent[store.defaultLocale as "en" | "zh"]?.[key]?.trim() ||
    defaultContent[locale][key]
  );
}
