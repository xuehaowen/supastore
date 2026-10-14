ALTER TABLE delivery_areas ADD COLUMN weekly_schedule jsonb NOT NULL DEFAULT '{}', ADD COLUMN prep_minutes integer NOT NULL DEFAULT 0 CHECK(prep_minutes>=0), ADD COLUMN schedule_required boolean NOT NULL DEFAULT false, ADD COLUMN slot_capacity integer CHECK(slot_capacity>=0);
--> statement-breakpoint
CREATE TABLE fulfillment_slots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),pickup_slot_id uuid UNIQUE REFERENCES pickup_time_slots(id),delivery_area_id uuid REFERENCES delivery_areas(id),date text NOT NULL,start_time text NOT NULL,end_time text NOT NULL,timezone text NOT NULL,capacity integer CHECK(capacity>=0),CHECK((pickup_slot_id IS NOT NULL) <> (delivery_area_id IS NOT NULL)),UNIQUE(delivery_area_id,date,start_time,end_time));
--> statement-breakpoint
INSERT INTO fulfillment_slots(pickup_slot_id,date,start_time,end_time,timezone,capacity) SELECT s.id,s.date,s.start_time,s.end_time,coalesce((select timezone from store_settings limit 1),'UTC'),l.slot_capacity FROM pickup_time_slots s JOIN pickup_location l ON l.id=s.location_id;
--> statement-breakpoint
ALTER TABLE slot_reservations DROP CONSTRAINT slot_reservations_slot_id_fkey;
ALTER TABLE slot_variant_quotas DROP CONSTRAINT slot_variant_quotas_slot_id_fkey;
UPDATE slot_reservations r SET slot_id=f.id FROM fulfillment_slots f WHERE r.slot_id=f.pickup_slot_id;
UPDATE slot_variant_quotas q SET slot_id=f.id FROM fulfillment_slots f WHERE q.slot_id=f.pickup_slot_id;
ALTER TABLE slot_reservations ADD CONSTRAINT slot_reservations_slot_id_fkey FOREIGN KEY(slot_id) REFERENCES fulfillment_slots(id);
ALTER TABLE slot_variant_quotas ADD CONSTRAINT slot_variant_quotas_slot_id_fkey FOREIGN KEY(slot_id) REFERENCES fulfillment_slots(id);
--> statement-breakpoint
ALTER TABLE order_fulfillments ADD COLUMN fulfillment_slot_id uuid REFERENCES fulfillment_slots(id);
UPDATE order_fulfillments o SET fulfillment_slot_id=f.id FROM fulfillment_slots f WHERE o.pickup_slot_id=f.pickup_slot_id;
