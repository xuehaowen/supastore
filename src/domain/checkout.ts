import { InvariantViolationError } from '@/application/common/errors';
export function shippingPrice(zones: { countryCodes: string[] | null; rateCents: number; freeThresholdCents: number | null }[], country: string, subtotal: number) {
  const zone = zones.find(z => z.countryCodes?.includes(country)) ?? zones.find(z => z.countryCodes === null);
  if (!zone) throw new InvariantViolationError('We do not ship to this destination.');
  return zone.freeThresholdCents !== null && subtotal >= zone.freeThresholdCents ? 0 : zone.rateCents;
}
export function validatePickup(location: { weeklySchedule: Record<string, [string, string][]>; blackoutDates: string[]; prepMinutes: number }, date: string, start: string, timezone: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(start)) throw new InvariantViolationError('Choose a valid pickup date and time.');
  const day = new Date(date + 'T12:00:00Z');
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0,10) !== date) throw new InvariantViolationError('Invalid pickup date.');
  const weekday = ['sun','mon','tue','wed','thu','fri','sat'][day.getUTCDay()]!;
  const slot = location.weeklySchedule[weekday]?.find(([from]) => from === start);
  const earliest = new Date(now.getTime() + location.prepMinutes * 60000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(earliest).map(p => [p.type,p.value]));
  const earliestLocal = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  if (!slot || location.blackoutDates.includes(date) || `${date}T${start}` < earliestLocal) throw new InvariantViolationError('This pickup slot is closed, past, or does not allow enough preparation time.');
  return { date, startTime: slot[0], endTime: slot[1] };
}

