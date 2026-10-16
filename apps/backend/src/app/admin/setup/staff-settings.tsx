import type { staffMemberships } from "@/infrastructure/db/schema";
import { updateStaffMember, removeStaffMember } from "@/app/actions";
import { Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Badge } from "@supastore/ui/badge";
import { NativeSelect } from "@supastore/ui/native-select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { AdminDialog } from "../admin-dialog";

export function StaffSettings({
  members,
  error,
  activeUserId,
}: {
  members: (typeof staffMemberships.$inferSelect)[];
  error?: string | undefined;
  activeUserId?: string | undefined;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>{member.email}</TableCell>
            <TableCell>{member.role}</TableCell>
            <TableCell>
              <Badge variant="outline">
                {member.isActive ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>
              <AdminDialog
                key={member.role + String(member.isActive) + (error ?? "")}
                trigger="Manage access"
                title={"Access for " + member.email}
                defaultOpen={Boolean(error && activeUserId === member.userId)}
              >
                <Notice error={error} />
                <form action={updateStaffMember}>
                  <Hidden name="targetUserId" value={member.userId} />
                  <label>
                    Role
                    <NativeSelect name="role" defaultValue={member.role}>
                      <option value="staff">Staff</option>
                      <option value="owner">Owner</option>
                    </NativeSelect>
                  </label>
                  <label>
                    Access
                    <NativeSelect
                      name="active"
                      defaultValue={String(member.isActive)}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </NativeSelect>
                  </label>
                  <Button type="submit">Save access</Button>
                </form>
                <details className="mt-6">
                  <summary>Remove membership</summary>
                  <p className="my-3">
                    This person will lose access to store administration. The
                    last active owner cannot be removed.
                  </p>
                  <form action={removeStaffMember}>
                    <Hidden name="targetUserId" value={member.userId} />
                    <Button type="submit" variant="destructive">
                      Remove membership
                    </Button>
                  </form>
                </details>
              </AdminDialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
