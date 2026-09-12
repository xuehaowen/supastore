"use client";

import { useState, useMemo } from "react";

export type PickupOption = {
  id: string;
  name: string;
  address: string;
  dates: { date: string; slots: { startTime: string; endTime: string }[] }[];
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function PickupCalendar({
  availableDates,
  selectedDate,
  onSelectDate,
}: {
  availableDates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}) {
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
      return `${MONTH_NAMES[month]} ${year}`;
    }
    const start = weekDays[0]!;
    const end = weekDays[6]!;
    if (start.getMonth() === end.getMonth()) {
      return `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
    }
    return `${MONTH_NAMES[start.getMonth()].slice(0, 3)} – ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
  }, [viewMode, month, year, weekDays]);

  const selectedDateFormatted = useMemo(() => {
    if (!selectedDate) return null;
    const d = parseDateKey(selectedDate);
    return `${WEEKDAYS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }, [selectedDate]);

  return (
    <div className="pickup-calendar-container">
      <div className="pickup-calendar-header">
        <div className="pickup-calendar-title-nav">
          <button
            type="button"
            className="secondary pickup-calendar-nav-btn"
            onClick={handlePrev}
            aria-label={viewMode === "week" ? "Previous week" : "Previous month"}
          >
            ‹
          </button>
          <span className="pickup-calendar-title">{headerTitle}</span>
          <button
            type="button"
            className="secondary pickup-calendar-nav-btn"
            onClick={handleNext}
            aria-label={viewMode === "week" ? "Next week" : "Next month"}
          >
            ›
          </button>
        </div>
        <button
          type="button"
          className="secondary pickup-calendar-toggle-btn"
          onClick={() => setViewMode(viewMode === "week" ? "month" : "week")}
        >
          {viewMode === "week" ? "Monthly view 📅" : "Weekly view 📅"}
        </button>
      </div>

      <div className="pickup-calendar-weekdays-row">
        {WEEKDAYS.map((name) => (
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
              <button
                type="button"
                key={key}
                disabled={!isAvailable}
                className={`pickup-calendar-day-btn ${isSelected ? "selected" : ""} ${!isAvailable ? "disabled" : ""}`}
                onClick={() => isAvailable && onSelectDate(key)}
              >
                <span className="day-number">{d.getDate()}</span>
                {isAvailable && <span className="available-dot" />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="pickup-calendar-grid month-view">
          {monthCells.map((d, index) => {
            if (!d) {
              return <div key={`empty-${index}`} className="pickup-calendar-day-empty" />;
            }
            const key = formatDateKey(d);
            const isAvailable = availableSet.has(key);
            const isSelected = selectedDate === key;
            return (
              <button
                type="button"
                key={key}
                disabled={!isAvailable}
                className={`pickup-calendar-day-btn ${isSelected ? "selected" : ""} ${!isAvailable ? "disabled" : ""}`}
                onClick={() => isAvailable && onSelectDate(key)}
              >
                <span className="day-number">{d.getDate()}</span>
                {isAvailable && <span className="available-dot" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="pickup-calendar-status">
        {selectedDateFormatted ? (
          <span className="pickup-calendar-selected-label">
            Selected date: <strong>{selectedDateFormatted}</strong>
          </span>
        ) : (
          <span className="pickup-calendar-hint">
            Please choose an available date from the calendar
          </span>
        )}
      </div>
      <input type="hidden" name="pickupDate" value={selectedDate} required />
    </div>
  );
}

export function CheckoutFields({
  locations,
  timezone,
}: {
  locations: PickupOption[];
  timezone: string;
}) {
  const [method, setMethod] = useState("shipping");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [date, setDate] = useState("");
  const location = locations.find((item) => item.id === locationId);
  const availableDateKeys = useMemo(
    () => location?.dates.map((item) => item.date) ?? [],
    [location],
  );
  const day = location?.dates.find((item) => item.date === date);

  return (
    <>
      <fieldset>
        <legend>Fulfillment</legend>
        {[
          { value: "shipping", label: "Shipping" },
          ...(locations.length
            ? [{ value: "pickup", label: "Local pickup" }]
            : []),
        ].map((item) => (
          <label className="check" key={item.value}>
            <input
              type="radio"
              name="fulfillmentType"
              value={item.value}
              checked={method === item.value}
              onChange={() => setMethod(item.value)}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      {method === "shipping" ? (
        <>
          <label>
            Street address
            <input name="address" required autoComplete="street-address" />
          </label>
          <label>
            Country code
            <input
              name="country"
              required
              defaultValue="US"
              pattern="[A-Za-z]{2}"
              autoComplete="country"
            />
          </label>
        </>
      ) : (
        <fieldset>
          <legend>Pickup details</legend>
          {locations.map((item) => (
            <label className="check" key={item.id}>
              <input
                type="radio"
                name="pickupLocationId"
                value={item.id}
                checked={locationId === item.id}
                onChange={() => {
                  setLocationId(item.id);
                  setDate("");
                }}
              />
              <span>
                {item.name}
                <br />
                {item.address}
              </span>
            </label>
          ))}

          <div className="pickup-date-selection-group">
            <label className="pickup-calendar-label">Pickup date</label>
            <PickupCalendar
              availableDates={availableDateKeys}
              selectedDate={date}
              onSelectDate={(newDate) => setDate(newDate)}
            />
          </div>

          <label>
            Pickup window
            <select
              name="pickupTime"
              required
              key={locationId + date}
              defaultValue=""
              disabled={!day}
            >
              <option value="">
                {day ? "Choose a pickup window" : "Select a date above first"}
              </option>
              {day?.slots.map((slot) => (
                <option key={slot.startTime} value={slot.startTime}>
                  {slot.startTime} – {slot.endTime}
                </option>
              ))}
            </select>
          </label>
          {!location?.dates.length && (
            <p role="status">
              No pickup windows are available in the next 90 days. Choose
              another location or shipping.
            </p>
          )}
          <p className="muted">
            Times are in {timezone}. Only dates and windows that allow
            preparation time are shown.
          </p>
        </fieldset>
      )}
    </>
  );
}

