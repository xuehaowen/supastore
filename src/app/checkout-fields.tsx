"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { textFor } from "@/i18n/messages";
import type { CheckoutDefaults } from "@/app/checkout-state";
import {
  countryOptions,
  usStates,
  shippingRequiredFields,
  type ShippingDestinationRule,
  type FulfillmentMethod,
} from "@/domain/shipping-destination";

export type PickupOption = {
  id: string;
  name: string;
  address: string;
  dates: { date: string; slots: { startTime: string; endTime: string }[] }[];
  scheduleRequired?: boolean;
};
export type DeliveryOption = {
  id: string;
  name: string;
  countryCodes: string[];
  postalPrefixes: string[];
  scheduleRequired: boolean;
  dates: PickupOption["dates"];
};

function parseDateKey(str: string): Date {
  const [year, month, day] = str.split("-").map(Number);
  return new Date(year!, month! - 1, day!);
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function PickupCalendar({
  availableDates,
  selectedDate,
  onSelectDate,
  locale,
}: {
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  locale: string;
}) {
  const m = textFor(locale).checkoutDetails;
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
      new Date(2026, 0, 4 + index),
    ),
  );
  const [viewMode, setViewMode] = useState<"week" | "month">("week");
  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);

  const [viewDate, setViewDate] = useState<Date>(() => {
    if (selectedDate) return parseDateKey(selectedDate);
    if (availableDates[0]) return parseDateKey(availableDates[0]);
    return new Date();
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const handlePrev = () => {
    if (viewMode === "week") {
      setViewDate(new Date(year, month, viewDate.getDate() - 7));
    } else {
      setViewDate(new Date(year, month - 1, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === "week") {
      setViewDate(new Date(year, month, viewDate.getDate() + 7));
    } else {
      setViewDate(new Date(year, month + 1, 1));
    }
  };

  // Weekly days
  const weekDays = useMemo(() => {
    const dayOfWeek = viewDate.getDay();
    const startOfWeek = new Date(year, month, viewDate.getDate() - dayOfWeek);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }, [viewDate, year, month]);

  // Monthly days
  const monthCells = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];

    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(null);
    }
    for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
      cells.push(new Date(year, month, dayNum));
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [year, month]);

  const headerTitle = useMemo(() => {
    if (viewMode === "month") {
      return new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(viewDate);
    }
    const start = weekDays[0]!;
    const end = weekDays[6]!;
    if (start.getMonth() === end.getMonth()) {
      return new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(start);
    }
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      year: "numeric",
    }).formatRange(start, end);
  }, [viewMode, viewDate, locale, weekDays]);

  const selectedDateFormatted = useMemo(() => {
    if (!selectedDate) return null;
    const d = parseDateKey(selectedDate);
    return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(d);
  }, [selectedDate, locale]);

  return (
    <div className="pickup-calendar-container">
      <div className="pickup-calendar-header">
        <div className="pickup-calendar-title-nav">
          <Button
            type="button"
            className="secondary pickup-calendar-nav-btn"
            onClick={handlePrev}
            aria-label={viewMode === "week" ? m.previousWeek : m.previousMonth}
          >
            ‹
          </Button>
          <span className="pickup-calendar-title">{headerTitle}</span>
          <Button
            type="button"
            className="secondary pickup-calendar-nav-btn"
            onClick={handleNext}
            aria-label={viewMode === "week" ? m.nextWeek : m.nextMonth}
          >
            ›
          </Button>
        </div>
        <Button
          type="button"
          className="secondary pickup-calendar-toggle-btn"
          onClick={() => setViewMode(viewMode === "week" ? "month" : "week")}
        >
          {viewMode === "week" ? m.monthlyView : m.weeklyView}
        </Button>
      </div>

      <div className="pickup-calendar-weekdays-row">
        {weekdays.map((name) => (
          <span key={name} className="pickup-calendar-weekday-header">
            {name}
          </span>
        ))}
      </div>

      {viewMode === "week" ? (
        <div className="pickup-calendar-grid week-view">
          {weekDays.map((d) => {
            const key = formatDateKey(d);
            const isAvailable = availableSet.has(key);
            const isSelected = selectedDate === key;
            return (
              <Button
                type="button"
                key={key}
                disabled={!isAvailable}
                aria-pressed={isSelected}
                className={`pickup-calendar-day-btn ${isSelected ? "selected" : ""} ${!isAvailable ? "disabled" : ""}`}
                onClick={() => isAvailable && onSelectDate(key)}
              >
                <span className="day-number">{d.getDate()}</span>
                {isAvailable && <span className="available-dot" />}
              </Button>
            );
          })}
        </div>
      ) : (
        <div className="pickup-calendar-grid month-view">
          {monthCells.map((d, index) => {
            if (!d) {
              return (
                <div
                  key={`empty-${index}`}
                  className="pickup-calendar-day-empty"
                />
              );
            }
            const key = formatDateKey(d);
            const isAvailable = availableSet.has(key);
            const isSelected = selectedDate === key;
            return (
              <Button
                type="button"
                key={key}
                disabled={!isAvailable}
                aria-pressed={isSelected}
                className={`pickup-calendar-day-btn ${isSelected ? "selected" : ""} ${!isAvailable ? "disabled" : ""}`}
                onClick={() => isAvailable && onSelectDate(key)}
              >
                <span className="day-number">{d.getDate()}</span>
                {isAvailable && <span className="available-dot" />}
              </Button>
            );
          })}
        </div>
      )}

      <div className="pickup-calendar-status">
        {selectedDateFormatted ? (
          <span className="pickup-calendar-selected-label">
            {m.selectedDate}: <strong>{selectedDateFormatted}</strong>
          </span>
        ) : (
          <span className="pickup-calendar-hint">{m.dateHint}</span>
        )}
      </div>
      <input type="hidden" name="pickupDate" value={selectedDate} required />
    </div>
  );
}

export function CheckoutFields({
  locations,
  timezone,
  addresses = [],
  locale = "en",
  initial = {},
  shippingRules = [],
  methods,
  deliveryAreas = [],
}: {
  locations: PickupOption[];
  timezone: string;
  addresses?: { id: string; label: string; address: Record<string, string> }[];
  locale?: string;
  initial?: CheckoutDefaults;
  shippingRules?: ShippingDestinationRule[];
  methods: FulfillmentMethod[];
  deliveryAreas?: DeliveryOption[];
}) {
  const labels = textFor(locale);
  const m = labels.checkoutDetails;
  const [chosenMethod, setMethod] = useState(initial.fulfillmentType ?? "");
  const method =
    methods.find((item) => item === chosenMethod) ?? methods[0] ?? "";
  const [deliveryAreaId, setDeliveryAreaId] = useState(
    deliveryAreas.find((item) => item.id === initial.deliveryAreaId)?.id ||
      deliveryAreas[0]?.id ||
      "",
  );
  const area = deliveryAreas.find((item) => item.id === deliveryAreaId);
  const [locationId, setLocationId] = useState(
    locations.find((item) => item.id === initial.pickupLocationId)?.id ||
      locations[0]?.id ||
      "",
  );
  const retainSchedule =
    method === initial.fulfillmentType &&
    (method === "local_delivery"
      ? deliveryAreas.some((item) => item.id === initial.deliveryAreaId)
      : method === "pickup" &&
        locations.some((item) => item.id === initial.pickupLocationId));
  const [date, setDate] = useState(
    retainSchedule ? (initial.pickupDate ?? "") : "",
  );
  const [time, setTime] = useState(
    retainSchedule ? (initial.pickupTime ?? "") : "",
  );
  const [street, setStreet] = useState(initial.address ?? "");
  const [country, setCountry] = useState(initial.country || "US");
  const [region, setRegion] = useState(initial.region ?? "");
  const [postalCode, setPostalCode] = useState(initial.postalCode ?? "");
  const requiredFields = shippingRequiredFields(shippingRules, country);
  const location = locations.find((item) => item.id === locationId);
  const availableDateKeys = useMemo(
    () => location?.dates.map((item) => item.date) ?? [],
    [location],
  );
  const day = location?.dates.find((item) => item.date === date);

  return (
    <>
      <fieldset>
        <legend>{m.fulfillment}</legend>
        {methods.map((value) => (
          <label className="check" key={value}>
            <input
              className="size-4 shrink-0"
              type="radio"
              name="fulfillmentType"
              value={value}
              checked={method === value}
              onChange={() => {
                setMethod(value);
                setDate("");
                setTime("");
              }}
            />
            {value === "shipping"
              ? labels.shipping
              : value === "pickup"
                ? labels.pickup
                : m.localDelivery}
          </label>
        ))}
      </fieldset>
      {method === "shipping" || method === "local_delivery" ? (
        <>
          {addresses.length > 0 && (
            <label>
              {m.savedAddress}
              <NativeSelect
                defaultValue=""
                onChange={(event) => {
                  const saved = addresses.find(
                    (a) => a.id === event.target.value,
                  );
                  if (saved) {
                    setStreet(
                      [
                        saved.address.name,
                        saved.address.line1,
                        saved.address.line2,
                        saved.address.city,
                        saved.address.region,
                        saved.address.postalCode,
                      ]
                        .filter(Boolean)
                        .join(", "),
                    );
                    setCountry(saved.address.country || "US");
                    setRegion(saved.address.region || "");
                    setPostalCode(saved.address.postalCode || "");
                  } else {
                    setStreet("");
                    setCountry("US");
                    setRegion("");
                    setPostalCode("");
                  }
                }}
              >
                <option value="">{m.newAddress}</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <label>
            {labels.streetAddress}
            <Input
              name="address"
              required
              autoComplete="street-address"
              value={street}
              onChange={(event) => setStreet(event.target.value)}
            />
          </label>
          <label>
            {labels.country}
            <NativeSelect
              name="country"
              aria-label={labels.country}
              required
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                setRegion("");
                setPostalCode("");
              }}
              autoComplete="country"
            >
              {countryOptions(locale).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {m.region}
            {country === "US" ? (
              <NativeSelect
                name="region"
                aria-label={m.region}
                autoComplete="address-level1"
                value={region}
                required={method === "shipping" && requiredFields.region}
                onChange={(event) => setRegion(event.target.value)}
              >
                <option value="">{m.chooseRegion}</option>
                {usStates.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                name="region"
                autoComplete="address-level1"
                maxLength={12}
                value={region}
                required={method === "shipping" && requiredFields.region}
                onChange={(event) =>
                  setRegion(event.target.value.toUpperCase())
                }
              />
            )}
          </label>
          <label>
            {m.postalCode}
            <Input
              name="postalCode"
              autoComplete="postal-code"
              maxLength={40}
              value={postalCode}
              required={
                method === "local_delivery" || requiredFields.postalCode
              }
              onChange={(event) => setPostalCode(event.target.value)}
            />
          </label>
          {method === "local_delivery" && (
            <>
              <label>
                {m.deliveryArea}
                <NativeSelect
                  aria-label={m.deliveryArea}
                  name="deliveryAreaId"
                  required
                  value={deliveryAreaId}
                  onChange={(event) => {
                    setDeliveryAreaId(event.target.value);
                    setDate("");
                    setTime("");
                  }}
                >
                  {deliveryAreas.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {area && (
                <p className="muted">
                  {area.countryCodes
                    .map(
                      (code) =>
                        countryOptions(locale).find((c) => c.code === code)
                          ?.name ?? code,
                    )
                    .join(", ")}
                  {area.postalPrefixes.length
                    ? ` · ${area.postalPrefixes.join(", ")}`
                    : ""}
                </p>
              )}
              {area?.scheduleRequired && (
                <>
                  <label className="pickup-calendar-label">
                    {m.deliveryDate}
                  </label>
                  <PickupCalendar
                    key={deliveryAreaId}
                    locale={locale}
                    availableDates={area.dates.map((item) => item.date)}
                    selectedDate={date}
                    onSelectDate={(value) => {
                      setDate(value);
                      setTime("");
                    }}
                  />
                  <label>
                    {m.deliveryWindow}
                    <NativeSelect
                      name="pickupTime"
                      aria-label={m.deliveryWindow}
                      required
                      value={time}
                      disabled={!date}
                      onChange={(event) => setTime(event.target.value)}
                    >
                      <option value="">{m.chooseWindow}</option>
                      {area.dates
                        .find((item) => item.date === date)
                        ?.slots.map((slot) => (
                          <option key={slot.startTime} value={slot.startTime}>
                            {slot.startTime} – {slot.endTime}
                          </option>
                        ))}
                    </NativeSelect>
                  </label>
                  {!area.dates.length && <p role="status">{m.noWindows}</p>}
                  <p className="muted">
                    {m.timezone.replace("{timezone}", timezone)}
                  </p>
                </>
              )}
            </>
          )}
        </>
      ) : method === "pickup" ? (
        <fieldset>
          <legend>{m.pickupDetails}</legend>
          {locations.map((item) => (
            <label className="check" key={item.id}>
              <input
                className="size-4 shrink-0"
                type="radio"
                name="pickupLocationId"
                value={item.id}
                checked={locationId === item.id}
                onChange={() => {
                  setLocationId(item.id);
                  setDate("");
                  setTime("");
                }}
              />
              <span>
                {item.name}
                <br />
                {item.address}
              </span>
            </label>
          ))}

          {location?.scheduleRequired !== false && (
            <>
              <div className="pickup-date-selection-group">
                <label className="pickup-calendar-label">{m.pickupDate}</label>
                <PickupCalendar
                  key={locationId}
                  locale={locale}
                  availableDates={availableDateKeys}
                  selectedDate={date}
                  onSelectDate={(newDate) => {
                    setDate(newDate);
                    setTime("");
                  }}
                />
              </div>

              <label>
                {m.pickupWindow}
                <NativeSelect
                  name="pickupTime"
                  required
                  key={locationId + date}
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  disabled={!day}
                >
                  <option value="">
                    {day ? m.chooseWindow : m.chooseDateFirst}
                  </option>
                  {day?.slots.map((slot) => (
                    <option key={slot.startTime} value={slot.startTime}>
                      {slot.startTime} – {slot.endTime}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              {!location?.dates.length && <p role="status">{m.noWindows}</p>}
              <p className="muted">
                {m.timezone.replace("{timezone}", timezone)}
              </p>
            </>
          )}
        </fieldset>
      ) : (
        <p role="status">{m.noFulfillment}</p>
      )}
    </>
  );
}
