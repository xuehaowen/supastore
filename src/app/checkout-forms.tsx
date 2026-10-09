"use client";

import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";
import { quoteCheckout, placeCheckout } from "@/app/actions";
import {
  CheckoutFields,
  type PickupOption,
  type DeliveryOption,
} from "@/app/checkout-fields";
import { CheckoutCredit } from "@/app/checkout-credit";
import type {
  CheckoutDefaults,
  CheckoutActionState,
} from "@/app/checkout-state";
import { Hidden, Notice } from "@/app/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { textFor } from "@/i18n/messages";
import type {
  ShippingDestinationRule,
  FulfillmentMethod,
} from "@/domain/shipping-destination";

const emptyState: CheckoutActionState = {};

function submitCheckout(
  event: FormEvent<HTMLFormElement>,
  action: (data: FormData) => void,
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  // Dispatch directly so returning validation errors does not reset the form.
  startTransition(() => action(data));
}

export function CheckoutDetailsForm({
  cartId,
  locale,
  locations,
  timezone,
  addresses,
  accounts,
  initial = {},
  canUseCredit,
  canBeFree,
  onlinePayment,
  shippingRules,
  methods,
  deliveryAreas,
}: {
  cartId: string;
  locale: string;
  locations: PickupOption[];
  timezone: string;
  addresses: { id: string; label: string; address: Record<string, string> }[];
  accounts: { id: string; name: string }[];
  initial?: CheckoutDefaults | undefined;
  canUseCredit: boolean;
  canBeFree: boolean;
  onlinePayment: boolean;
  shippingRules: ShippingDestinationRule[];
  methods: FulfillmentMethod[];
  deliveryAreas: DeliveryOption[];
}) {
  const [state, action, pending] = useActionState(quoteCheckout, emptyState);
  const [promotion, setPromotion] = useState(initial.promotionCode ?? "");
  const [payment, setPayment] = useState(
    initial.paymentAccountId ?? (onlinePayment ? "" : (accounts[0]?.id ?? "")),
  );
  const t = textFor(locale);
  const m = t.checkoutDetails;
  const allowEmpty = onlinePayment || canUseCredit || canBeFree;
  return (
    <form
      className="grid gap-5"
      action={action}
      onSubmit={(event) => submitCheckout(event, action)}
    >
      <Notice error={state.error} locale={locale} />
      <Hidden name="locale" value={locale} />
      <Hidden name="cartId" value={cartId} />
      <CheckoutFields
        initial={initial}
        locale={locale}
        locations={locations}
        timezone={timezone}
        addresses={addresses}
        shippingRules={shippingRules}
        methods={methods}
        deliveryAreas={deliveryAreas}
      />
      <Label className="grid gap-2">
        {m.promotion}
        <Input
          name="promotionCode"
          value={promotion}
          maxLength={100}
          onChange={(event) => setPromotion(event.target.value)}
        />
      </Label>
      <Label className="grid gap-2">
        {t.payment}
        <NativeSelect
          name="paymentAccountId"
          required={!allowEmpty}
          value={payment}
          onChange={(event) => setPayment(event.target.value)}
        >
          <option value="" disabled={!allowEmpty}>
            {onlinePayment
              ? m.onlinePayment
              : allowEmpty
                ? m.creditOrFree
                : m.choosePayment}
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
      </Label>
      <Button type="submit" size="lg" disabled={pending || !methods.length}>
        {t.review} →
      </Button>
    </form>
  );
}

export function CheckoutOrderForm({
  quoteId,
  locale,
  customerName = "",
  customerEmail = "",
  credit,
}: {
  quoteId: string;
  locale: string;
  customerName?: string | undefined;
  customerEmail?: string | undefined;
  credit?:
    | {
        availableCents: number;
        purchaseCents: number;
        currency: string;
        precision: number;
        payInFull: boolean;
      }
    | undefined;
}) {
  const [state, action, pending] = useActionState(placeCheckout, emptyState);
  const [name, setName] = useState(customerName);
  const [email, setEmail] = useState(customerEmail);
  const [accepted, setAccepted] = useState(false);
  const t = textFor(locale);
  return (
    <form
      className="grid gap-4"
      action={action}
      onSubmit={(event) => submitCheckout(event, action)}
    >
      <Notice error={state.error} locale={locale} />
      <Hidden name="locale" value={locale} />
      <Hidden name="quoteId" value={quoteId} />
      <Label className="grid gap-2">
        {t.name}
        <Input
          name="name"
          value={name}
          autoComplete="name"
          required
          onChange={(event) => setName(event.target.value)}
        />
      </Label>
      <Label className="grid gap-2">
        {t.email}
        <Input
          name="email"
          type="email"
          value={email}
          autoComplete="email"
          required
          onChange={(event) => setEmail(event.target.value)}
        />
      </Label>
      {credit && (
        <CheckoutCredit
          {...credit}
          locale={locale}
          defaultAmount={
            credit.payInFull
              ? String(
                  Math.min(credit.availableCents, credit.purchaseCents) /
                    10 ** credit.precision,
                )
              : "0"
          }
        />
      )}
      <Label className="flex items-start gap-3 font-normal">
        <input
          className="mt-0.5 size-4 shrink-0"
          type="checkbox"
          name="accepted"
          value="yes"
          required
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        {t.acceptTerms}
      </Label>
      <Button type="submit" disabled={pending}>
        {t.place}
      </Button>
    </form>
  );
}
