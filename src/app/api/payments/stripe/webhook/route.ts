import { acceptStripeEvent } from "@/application/use-cases/payments/stripe-checkout";
import {
  verifyStripeWebhook,
  StripeAdapterError,
} from "@/infrastructure/payments/stripe";
export async function POST(request: Request) {
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "Missing body." }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 1048576) {
      await reader.cancel();
      return Response.json({ error: "Payload too large." }, { status: 413 });
    }
    chunks.push(chunk.value);
  }
  const bytes = Buffer.concat(chunks);
  let event;
  try {
    event = verifyStripeWebhook(
      bytes,
      request.headers.get("stripe-signature") ?? "",
      process.env.STRIPE_WEBHOOK_SECRET ?? "",
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof StripeAdapterError
            ? error.message
            : "Invalid webhook.",
      },
      { status: 400 },
    );
  }
  try {
    return Response.json(await acceptStripeEvent(event));
  } catch (error) {
    console.error("Stripe webhook remains pending", {
      eventId: event.id,
      error,
    });
    return Response.json(
      { error: "Payment event requires retry." },
      { status: 503 },
    );
  }
}
