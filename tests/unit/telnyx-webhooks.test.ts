import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  verifyTelnyxSignature,
  normalizeTelnyxEvent,
} from "@/infrastructure/webhooks/telnyx";
import { telnyxSmsIdentity } from "@/infrastructure/notifications/provider-config";
const keys = generateKeyPairSync("ed25519"),
  publicKey = keys.publicKey
    .export({ format: "der", type: "spki" })
    .subarray(-32)
    .toString("base64");
function payload(eventType = "message.finalized", text = "STOP") {
  return JSON.stringify({
    data: {
      id: "event-1",
      event_type: eventType,
      occurred_at: "2026-10-06T12:00:00Z",
      payload: {
        id: "message-1",
        messaging_profile_id: "profile-old",
        from: {
          phone_number:
            eventType === "message.received" ? "+12025550123" : "+12025550000",
        },
        to: [
          {
            phone_number:
              eventType === "message.received"
                ? "+12025550000"
                : "+12025550123",
            status: "delivered",
          },
        ],
        text,
      },
    },
  });
}
afterEach(() => vi.unstubAllEnvs());
it("authenticates timestamp plus raw Ed25519 payload, fails closed on missing key and tampering", () => {
  const timestamp = "1791288000",
    raw = Buffer.from(payload()),
    signature = sign(
      null,
      Buffer.concat([Buffer.from(timestamp + "|"), raw]),
      keys.privateKey,
    ).toString("base64"),
    now = Number(timestamp) * 1000;
  expect(verifyTelnyxSignature(raw, timestamp, signature, publicKey, now)).toBe(
    true,
  );
  expect(verifyTelnyxSignature(raw, timestamp, signature, "", now)).toBe(false);
  expect(
    verifyTelnyxSignature(
      Buffer.from(payload() + " "),
      timestamp,
      signature,
      publicKey,
      now,
    ),
  ).toBe(false);
  expect(
    verifyTelnyxSignature(raw, timestamp, signature, publicKey, now + 301000),
  ).toBe(false);
  expect(verifyTelnyxSignature(raw, timestamp, "invalid", publicKey, now)).toBe(
    false,
  );
});
it("pins delivery identity to original callback profile/sender instead of current settings", () => {
  vi.stubEnv("TELNYX_FROM_NUMBER", "+12025550999");
  expect(normalizeTelnyxEvent(payload())).toMatchObject({
    ...telnyxSmsIdentity("profile-old", "+12025550000"),
    state: "delivered",
    providerMessageId: "message-1",
  });
});
it("normalizes STOP using merchant recipient identity and never accepts START as consent", () => {
  expect(
    normalizeTelnyxEvent(payload("message.received", "STOP")),
  ).toMatchObject({
    ...telnyxSmsIdentity("profile-old", "+12025550000"),
    state: "opted_out",
    phone: "+12025550123",
  });
  expect(normalizeTelnyxEvent(payload("message.received", "START"))).toBeNull();
});
