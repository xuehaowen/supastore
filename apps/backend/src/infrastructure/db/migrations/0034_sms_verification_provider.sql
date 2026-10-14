ALTER TABLE sms_preferences ADD COLUMN verification_provider text;
ALTER TABLE sms_preferences ADD COLUMN verification_profile text;
ALTER TABLE sms_preferences ADD COLUMN request_nonce uuid;
ALTER TABLE sms_preferences ADD COLUMN request_window_at timestamptz;
ALTER TABLE sms_preferences ADD COLUMN request_window_count integer NOT NULL DEFAULT 0;
ALTER TABLE sms_preferences ADD CONSTRAINT sms_verification_window_count CHECK(request_window_count>=0);
-- Previous verification IDs are provider-unbound. Require new consent/proof;
-- retaining subscribed/verified preferences does not reuse old approval IDs.
UPDATE sms_preferences SET verification_sid=NULL;
