DROP INDEX "uq_pickup_slot";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_pickup_slot" ON "pickup_time_slots" USING btree ("location_id","date","start_time","end_time");