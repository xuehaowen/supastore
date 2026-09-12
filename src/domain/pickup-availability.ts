import { validatePickup } from "./checkout";

export function pickupAvailability(
  location: Parameters<typeof validatePickup>[0],
  timezone: string,
  now = new Date(),
) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const first = new Date(`${parts.year}-${parts.month}-${parts.day}T12:00:00Z`);
  const dates = [];
  for (let offset = 0; offset < 90; offset++) {
    const current = new Date(first.getTime() + offset * 86400000);
    const date = current.toISOString().slice(0, 10);
    const weekday = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][
      current.getUTCDay()
    ]!;
    const slots = (location.weeklySchedule[weekday] ?? []).flatMap(
      ([start]) => {
        try {
          return [validatePickup(location, date, start, timezone, now)];
        } catch {
          return [];
        }
      },
    );
    if (slots.length) dates.push({ date, slots });
  }
  return dates;
}
