import type { paymentAccounts } from "@/infrastructure/db/schema";
import { savePayment } from "@/app/actions";
import { Field, Hidden, Notice } from "@/app/components";
import { Button } from "@supastore/ui/button";
import { Badge } from "@supastore/ui/badge";
import { NativeSelect } from "@supastore/ui/native-select";
import { Textarea } from "@supastore/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@supastore/ui/table";
import { AdminDialog } from "../admin-dialog";

type Account = typeof paymentAccounts.$inferSelect;
function PaymentForm({
  account,
  error,
}: {
  account?: Account;
  error?: string | undefined;
}) {
  return (
    <form action={savePayment}>
      <Notice error={error} />
      {account && (
        <>
          <Hidden name="id" value={account.id} />
          <Hidden name="mode" value="edit" />
        </>
      )}
      <Field label="Method name" name="name" value={account?.accountName} />
      <label>
        Payment type
        <NativeSelect
          name="accountType"
          defaultValue={account?.accountType ?? "other"}
        >
          <option value="other">Other</option>
          <option value="cash">Cash</option>
          <option value="zelle">Zelle</option>
          <option value="venmo">Venmo</option>
        </NativeSelect>
      </label>
      <label>
        Receiving account and instructions
        <Textarea
          name="instructions"
          defaultValue={account?.accountIdentifier ?? ""}
          required
        />
      </label>
      <Button type="submit">
        {account ? "Save method details" : "Add payment method"}
      </Button>
    </form>
  );
}
export function PaymentSettings({
  accounts,
  error,
}: {
  accounts: Account[];
  error?: string | undefined;
}) {
  return (
    <>
      <AdminDialog
        key={accounts.length}
        trigger="Add payment method"
        title="Add payment method"
      >
        <PaymentForm error={error} />
      </AdminDialog>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Method</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell>
                <strong>{account.accountName}</strong>
                <small>{account.accountType}</small>
              </TableCell>
              <TableCell>{account.accountIdentifier}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {account.isActive ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="admin-page-actions">
                  {account.accountType !== "stripe" ? (
                    <AdminDialog
                      key={account.updatedAt.toISOString()}
                      trigger="Edit method"
                      title={"Edit " + account.accountName}
                    >
                      <PaymentForm account={account} error={error} />
                    </AdminDialog>
                  ) : (
                    <span>Managed by payment provider</span>
                  )}
                  <form action={savePayment}>
                    <Hidden name="id" value={account.id} />
                    <Hidden name="active" value={String(!account.isActive)} />
                    <Button type="submit" variant="outline">
                      {account.isActive ? "Disable" : "Enable"}
                    </Button>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {!accounts.length && (
            <TableRow>
              <TableCell colSpan={4}>No payment methods yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
