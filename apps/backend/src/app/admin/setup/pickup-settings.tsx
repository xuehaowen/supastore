import type { pickupLocation } from "@/infrastructure/db/schema";
import { savePickup } from "@/app/actions";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Checkbox } from "@supastore/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { AdminDialog } from "../admin-dialog";
import { WeeklyScheduleEditor } from "../weekly-schedule-editor";

type Location = typeof pickupLocation.$inferSelect;
function PickupForm({
  location,
  error,
}: {
  location?: Location;
  error?: string | undefined;
}) {
  return (
    <form action={savePickup}>
      <Notice error={error} />
      {location && <Hidden name="pickupLocationId" value={location.id} />}
      <Field label="Location name" name="name" value={location?.name} />
      <Field label="Pickup address" name="address" value={location?.address} />
      <Field
        label="Orders per pickup slot (blank = unlimited, 0 = closed)"
        name="slotCapacity"
        type="number"
        value={location?.slotCapacity ?? ""}
        required={false}
      />
      <label className="check">
        <Checkbox
          name="scheduleRequired"
          defaultChecked={location?.scheduleRequired ?? true}
        />
        Require a pickup time window
      </label>
      <Field
        label="Preparation notice (minutes)"
        name="prepMinutes"
        type="number"
        value={location?.prepMinutes ?? 60}
      />
      <WeeklyScheduleEditor
        value={
          location?.weeklySchedule ?? {
            mon: [["09:00", "17:00"]],
            tue: [["09:00", "17:00"]],
            wed: [["09:00", "17:00"]],
            thu: [["09:00", "17:00"]],
            fri: [["09:00", "17:00"]],
          }
        }
      />
      <Button type="submit">Save pickup</Button>
    </form>
  );
}

export function PickupSettings({
  locations,
  error,
}: {
  locations: Location[];
  error?: string | undefined;
}) {
  return (
    <>
      <AdminDialog
        wide
        key={locations.length}
        trigger="Add pickup location"
        title="Add pickup location"
      >
        <PickupForm error={error} />
      </AdminDialog>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Notice</TableHead>
            <TableHead>Capacity per slot</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.map((location) => (
            <TableRow key={location.id}>
              <TableCell>{location.name}</TableCell>
              <TableCell>{location.address}</TableCell>
              <TableCell>{location.prepMinutes} min</TableCell>
              <TableCell>{location.slotCapacity ?? "Unlimited"}</TableCell>
              <TableCell>
                <AdminDialog
                  wide
                  key={location.updatedAt.toISOString()}
                  trigger="Edit location"
                  title={"Edit " + location.name}
                >
                  <PickupForm location={location} error={error} />
                </AdminDialog>
              </TableCell>
            </TableRow>
          ))}
          {!locations.length && (
            <TableRow>
              <TableCell colSpan={5}>No pickup locations yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
