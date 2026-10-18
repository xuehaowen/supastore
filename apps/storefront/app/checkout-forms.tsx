"use client";

import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";
import { quoteCheckout, placeCheckout } from "./actions";
import {
  CheckoutFields,
  type PickupOption,
  type DeliveryOption,
} from "./checkout-fields";
import { CheckoutCredit } from "./checkout-credit";
import type { CheckoutDefaults, CheckoutActionState } from "./checkout-state";
import { Hidden, Notice } from "./components";
import { Button } from "@supastore/ui/button";
import { Input } from "@supastore/ui/input";
import { Label } from "@supastore/ui/label";
import { NativeSelect } from "@supastore/ui/native-select";
import { textFor } from "@supastore/i18n/messages";
import type {
  ShippingDestinationRule,
  FulfillmentMethod,
} from "@supastore/shipping/destination";
import { CheckoutPreview } from "./checkout-preview";

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
  onlinePayment,
  shippingRules,
  methods,
  deliveryAreas,
  evaluationItems,
}: {
  cartId: string;
  locale: string;
  locations: PickupOption[];
  timezone: string;
  addresses: { id: string; label: string; address: Record<string, string> }[];
  accounts: { id: string; name: string }[];
  initial?: CheckoutDefaults | undefined;
  onlinePayment: boolean;
  shippingRules: ShippingDestinationRule[];
  methods: FulfillmentMethod[];
  deliveryAreas: DeliveryOption[];
  evaluationItems?: { variantId: string; quantity: number }[];
}) {
  const [state, action, pending] = useActionState(quoteCheckout, emptyState);
  const [promotion, setPromotion] = useState(initial.promotionCode ?? "");
  const [payment, setPayment] = useState(
    initial.paymentAccountId ?? (onlinePayment ? "" : (accounts[0]?.id ?? "")),
  );
  const t = textFor(locale);
  const m = t.checkoutDetails;
  const [previewRevision, setPreviewRevision] = useState(0);
  return (
    <form
      className="grid gap-5"
      action={action}
      onSubmit={(event) => submitCheckout(event, action)}
      onChange={() => setPreviewRevision((value) => value + 1)}
    >
      <Notice error={state.error} locale={locale} requestId={state.requestId} />
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
          value={payment}
          onChange={(event) => setPayment(event.target.value)}
        >
          <option value="">
            {onlinePayment ? m.onlinePayment : m.reviewBeforePayment}
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </NativeSelect>
      </Label>
      {evaluationItems && (
        <CheckoutPreview
          key={previewRevision}
          items={evaluationItems}
          locale={locale}
        />
      )}
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
      <Notice error={state.error} locale={locale} requestId={state.requestId} />
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
