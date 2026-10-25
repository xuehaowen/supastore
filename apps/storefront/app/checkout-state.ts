export interface CheckoutActionState {
  error?: string;
  requestId?: string;
  fieldErrors?: Record<string, string>;
}

export interface CheckoutDefaults {
  fulfillmentType?: string;
  address?: string;
  recipientName?: string;
  line2?: string;
  city?: string;
  country?: string;
  region?: string;
  postalCode?: string;
  pickupLocationId?: string;
  deliveryAreaId?: string;
  pickupDate?: string;
  pickupTime?: string;
  paymentAccountId?: string;
  promotionCode?: string;
}
