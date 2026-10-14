CREATE TABLE IF NOT EXISTS sms_preferences (
 customer_id uuid PRIMARY KEY REFERENCES customers(id), phone text NOT NULL,
 locale text NOT NULL DEFAULT 'en', timezone text NOT NULL DEFAULT 'UTC',
 opted_in boolean NOT NULL DEFAULT false, verification_sid text,
 verified_at timestamptz, requested_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0, consent_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE event_deliveries ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE event_deliveries ADD COLUMN IF NOT EXISTS provider_status text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_event_sms_recipient ON event_deliveries(event_id, channel, recipient) WHERE channel = 'sms';
