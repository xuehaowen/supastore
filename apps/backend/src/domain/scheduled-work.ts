import { Temporal } from "@js-temporal/polyfill";

export function pickupReminderTime(
  date: string,
  time: string,
  timezone: string,
  leadMinutes: number,
) {
  if (
    !Number.isSafeInteger(leadMinutes) ||
    leadMinutes < 0 ||
    leadMinutes > 10080
  )
    throw new Error("Reminder lead time must be between zero and seven days.");
  const pickup = Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(
    timezone,
    { disambiguation: "reject" },
  );
  const expiresAt = new Date(pickup.epochMilliseconds);
  return {
    scheduledFor: new Date(expiresAt.getTime() - leadMinutes * 60000),
    expiresAt,
  };
}

export function reminderIsCurrent(input: {
  lifecycleStatus: string;
  fulfillmentStatus: string;
  currentSlotId: string | null;
  expectedSlotId: string;
  expiresAt: Date;
  now: Date;
}) {
  return (
    input.lifecycleStatus === "confirmed" &&
    ["unfulfilled", "preparing", "ready_for_pickup"].includes(
      input.fulfillmentStatus,
    ) &&
    input.currentSlotId === input.expectedSlotId &&
    input.now < input.expiresAt
  );
}
