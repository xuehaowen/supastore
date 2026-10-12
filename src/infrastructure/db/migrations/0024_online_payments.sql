CREATE TABLE stripe_checkout_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
 amount_cents integer NOT NULL CHECK (amount_cents > 0),
 currency text NOT NULL,
 financial_revision integer NOT NULL,
 idempotency_key text NOT NULL UNIQUE,
 session_id text UNIQUE,
 payment_intent_id text UNIQUE,
 checkout_url text,
 receipt_id uuid UNIQUE REFERENCES payment_receipts(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','open','paid','expired','review')),
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE stripe_webhook_inbox (
 event_id text PRIMARY KEY,
 event_type text NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','review')),
 review_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz
);
CREATE INDEX stripe_inbox_pending ON stripe_webhook_inbox(status,created_at);
CREATE TABLE stripe_refund_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 allocation_id uuid NOT NULL UNIQUE REFERENCES payout_allocations(id) ON DELETE RESTRICT,
 payout_attempt_id uuid NOT NULL UNIQUE REFERENCES payout_attempts(id) ON DELETE RESTRICT,
 payment_intent_id text NOT NULL,
 amount_cents integer NOT NULL CHECK (amount_cents > 0),
 currency text NOT NULL,
 idempotency_key text NOT NULL UNIQUE,
 refund_id text UNIQUE,
 status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating','pending','succeeded','review')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
