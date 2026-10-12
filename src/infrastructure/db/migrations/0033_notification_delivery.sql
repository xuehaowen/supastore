ALTER TABLE event_deliveries ADD COLUMN provider_name text, ADD COLUMN provider_profile text, ADD COLUMN delivery_tracking boolean NOT NULL DEFAULT false, ADD COLUMN idempotency_window_ms integer CHECK(idempotency_window_ms > 0), ADD COLUMN first_submitted_at timestamptz, ADD COLUMN prepared_message jsonb, ADD COLUMN last_attempt_id uuid, ADD COLUMN provider_event_at timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX uq_notification_provider_message ON event_deliveries(provider_name,provider_profile,provider_message_id);
--> statement-breakpoint
CREATE TABLE notification_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), delivery_id uuid NOT NULL REFERENCES event_deliveries(id), lease_token text NOT NULL, request_id uuid NOT NULL, attempt_number integer NOT NULL CHECK(attempt_number > 0), provider text NOT NULL, profile text NOT NULL, prepared_message jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(delivery_id,attempt_number));
--> statement-breakpoint
CREATE TABLE notification_attempt_results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), attempt_id uuid NOT NULL REFERENCES notification_attempts(id), result_key text NOT NULL UNIQUE, outcome text NOT NULL CHECK(outcome IN ('accepted','rejected','unknown')), provider_message_id text, code text, duration_ms integer NOT NULL DEFAULT 0 CHECK(duration_ms >= 0), created_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
ALTER TABLE event_deliveries ADD CONSTRAINT fk_notification_last_attempt FOREIGN KEY(last_attempt_id) REFERENCES notification_attempts(id);
--> statement-breakpoint
CREATE INDEX idx_notification_result_message ON notification_attempt_results(provider_message_id);
--> statement-breakpoint
CREATE TRIGGER notification_attempt_history BEFORE UPDATE OR DELETE ON notification_attempts FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
--> statement-breakpoint
CREATE TRIGGER notification_result_history BEFORE UPDATE OR DELETE ON notification_attempt_results FOR EACH ROW EXECUTE FUNCTION protect_commerce_ledger();
--> statement-breakpoint
CREATE TABLE notification_inbox(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, profile text NOT NULL, event_id text NOT NULL, payload jsonb NOT NULL, payload_hash text NOT NULL, raw_body text, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applied','unmatched')), attempts integer NOT NULL DEFAULT 0, retry_after timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,profile,event_id));
--> statement-breakpoint
CREATE INDEX idx_notification_inbox_pending ON notification_inbox(status,retry_after);
--> statement-breakpoint
-- A legacy active lease cannot prove whether a submission was accepted.
UPDATE event_deliveries SET status='review',lease_token=NULL,lease_expires_at=NULL WHERE lease_token IS NOT NULL;
--> statement-breakpoint
-- Legacy email success recorded SMTP acceptance, not confirmed recipient delivery.
-- Preserve the acknowledgment without retrying an already submitted message.
UPDATE event_deliveries SET status='accepted',provider_status='legacy_success_unverified' WHERE channel='email' AND status='delivered';
