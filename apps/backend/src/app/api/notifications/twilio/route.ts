// Retired provider endpoint: never mutate preferences or delivery facts here.
export async function POST() {
  return Response.json(
    { error: "Twilio callbacks are retired. Configure the Telnyx webhook." },
    { status: 410 },
  );
}
