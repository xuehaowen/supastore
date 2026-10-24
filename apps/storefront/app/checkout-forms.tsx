"use client";

import {
  startTransition,
  useActionState,
  useState,
  useEffect,
  useRef,
  type FormEvent,
} from "react";
import { quoteCheckout, placeCheckout } from "./actions";
import {
  CheckoutFields,
  type PickupOption,
  type DeliveryOption,
} from "./checkout-fields";
const CheckoutCredit = dynamic(() =>
  import("./checkout-credit").then((module) => module.CheckoutCredit),
);
import type { CheckoutDefaults, CheckoutActionState } from "./checkout-state";
import { Hidden } from "./components";
import {
  CustomerForm,
  CustomerInput as Input,
  CustomerSelect as NativeSelect,
  CustomerCheckbox,
} from "./customer-form";
import { Button } from "@supastore/ui/button";
import { Label } from "@supastore/ui/label";
import { textFor } from "@supastore/i18n/messages";
import {
  checkoutDraftKey,
  readCheckoutDraft,
  saveCheckoutDraft,
  CHECKOUT_PLACEMENT_PREFIX,
} from "../lib/checkout-draft";
import type {
  ShippingDestinationRule,
  FulfillmentMethod,
} from "@supastore/shipping/destination";
import dynamic from "next/dynamic";
const CheckoutPreview = dynamic(() =>
  import("./checkout-preview").then((module) => module.CheckoutPreview),
);
const SmsOptIn = dynamic(() =>
  import("./sms-opt-in").then((module) => module.SmsOptIn),
);

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
  draftOwner = "guest",
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
  draftOwner?: string;
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
  const [draftInitial, setDraftInitial] = useState(initial);
  const [draftRevision, setDraftRevision] = useState(0);
  const [draftStatus, setDraftStatus] = useState<"saved" | "restored" | null>(
    null,
  );
  const edited = useRef(false);
  const serverInitial = useRef(initial);
  const draftKey = checkoutDraftKey(cartId, draftOwner);
  useEffect(() => {
    try {
      const draft = readCheckoutDraft(sessionStorage, draftKey);
      if (!draft || edited.current || Object.keys(serverInitial.current).length)
        return;
      setDraftInitial(draft);
      setPromotion(draft.promotionCode ?? "");
      setDraftRevision((value) => value + 1);
      setPreviewRevision((value) => value + 1);
      setDraftStatus("restored");
    } catch {
      /* Checkout remains usable without browser storage. */
    }
    // Server defaults take precedence when editing a reviewed quote.
  }, [draftKey]);
  return (
    <CustomerForm
      locale={locale}
      error={state.error}
      fieldErrors={state.fieldErrors}
      requestId={state.requestId}
      busy={pending}
      className="grid gap-5"
      action={action}
      onSubmit={(event) => submitCheckout(event, action)}
      onInputCapture={() => {
        edited.current = true;
      }}
      onChange={(event) => {
        edited.current = true;
        const form = event.currentTarget;
        setPreviewRevision((value) => value + 1);
        queueMicrotask(() => {
          try {
            if (saveCheckoutDraft(sessionStorage, draftKey, new FormData(form)))
              setDraftStatus((current) => current ?? "saved");
          } catch {
            /* Browser storage is optional. */
          }
        });
      }}
    >
      {draftStatus && (
        <div className="rounded border p-3 text-sm">
          <p role="status">
            {draftStatus === "restored" ? m.draftRestored : m.draftSaved}
          </p>
          <button
            type="button"
            disabled={pending}
            className="mt-2 underline underline-offset-4"
            onClick={() => {
              try {
                sessionStorage.removeItem(draftKey);
              } catch {
                /* Optional storage. */
              }
              setDraftInitial(initial);
              setPromotion(initial.promotionCode ?? "");
              setDraftRevision((value) => value + 1);
              setDraftStatus(null);
              setPreviewRevision((value) => value + 1);
            }}
          >
            {m.clearDraft}
          </button>
        </div>
      )}
      <Hidden name="locale" value={locale} />
      <Hidden name="cartId" value={cartId} />
      <CheckoutFields
        key={draftRevision}
        initial={draftInitial}
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
        {pending ? t.form.reviewing : t.review} →
      </Button>
    </CustomerForm>
  );
}

export function CheckoutOrderForm({
  quoteId,
  locale,
  customerName = "",
  customerEmail = "",
  credit,
  sms,
  draftKey,
}: {
  quoteId: string;
  draftKey?: string;
  locale: string;
  customerName?: string | undefined;
  customerEmail?: string | undefined;
  sms?: { storeName: string; available: boolean } | undefined;
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
    <CustomerForm
      locale={locale}
      error={state.error}
      fieldErrors={state.fieldErrors}
      requestId={state.requestId}
      busy={pending}
      className="grid gap-4"
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        if (draftKey) {
          try {
            const token = crypto.randomUUID();
            sessionStorage.setItem(
              CHECKOUT_PLACEMENT_PREFIX + token,
              JSON.stringify({ key: draftKey, placedAt: Date.now() }),
            );
            data.set("draftToken", token);
          } catch {
            /* Storage must not prevent placing an order. */
          }
        }
        startTransition(() => action(data));
      }}
    >
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
      {sms && (
        <SmsOptIn
          storeName={sms.storeName}
          available={sms.available}
          locale={locale}
          source="checkout"
        />
      )}
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
      <CustomerCheckbox
        label={t.acceptTerms}
        className="mt-0.5 size-4 shrink-0"
        type="checkbox"
        name="accepted"
        value="yes"
        required
        checked={accepted}
        onChange={(event) => setAccepted(event.target.checked)}
      />
      <Button type="submit" disabled={pending}>
        {pending ? t.form.placing : t.place}
      </Button>
    </CustomerForm>
  );
}
