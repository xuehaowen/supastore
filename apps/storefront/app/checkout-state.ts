export interface CheckoutActionState {
  error?: string;
  requestId?: string;
}

export interface CheckoutDefaults {
  fulfillmentType?: string;
  address?: string;
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
