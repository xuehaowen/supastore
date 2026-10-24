import { randomUUID } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const server = process.env.TRANSLATION_TEST_DATABASE_URL;

describe.skipIf(!server)("commerce reference upgrade", () => {
  it("renumbers pre-launch records, preserves transactions, and allocates unique numbers concurrently", async () => {
    const name = `reference_upgrade_${randomUUID().replaceAll("-", "")}`;
    const admin = postgres(server!);
    let client: ReturnType<typeof postgres> | undefined;
    try {
      await admin.unsafe(
        `CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER builtin BUILTIN_LOCALE 'PG_UNICODE_FAST'`,
      );
      const url = new URL(server!);
      url.pathname = `/${name}`;
      const sql = (client = postgres(url.toString(), { onnotice: () => {} }));
      const migrations = readMigrationFiles({
        migrationsFolder: "apps/backend/src/infrastructure/db/migrations",
      });
      // Upgrade a real pre-change schema with data, including all existing guards.
      await sql.begin(async (tx) => {
        for (const migration of migrations.slice(0, -1))
          for (const statement of migration.sql)
            if (statement.trim()) await tx.unsafe(statement);
      });
      const [account] =
        await sql`insert into payment_accounts(account_identifier,account_name) values('venmo-test','Venmo') returning id`;
      async function order(reference?: string, date = "2026-10-02T00:00:00Z") {
        const [cart] =
          await sql`insert into carts(guest_session_id) values(${randomUUID()}) returning id`;
        const [quote] =
          await sql`insert into quotes(cart_id,cart_revision,merchandise_subtotal_cents,shipping_cents,exclusive_tax_cents,inclusive_tax_cents,total_payable_cents,items_snapshot,shipping_snapshot,expires_at)
          values(${cart!.id},1,100,0,0,0,100,'[]','{}',now()+interval '15 minutes') returning id`;
        return reference
          ? (
              await sql`insert into orders(source_cart_id,quote_id,reference_code,purchase_total_cents,guest_name,guest_email,shipping_address_snapshot,created_at)
            values(${cart!.id},${quote!.id},${reference},100,'Buyer','buyer@example.test','{}',${date}) returning *`
            )[0]!
          : (
              await sql`insert into orders(source_cart_id,quote_id,purchase_total_cents,guest_name,guest_email,shipping_address_snapshot)
            values(${cart!.id},${quote!.id},100,'Buyer','buyer@example.test','{}') returning *`
            )[0]!;
      }
      const later = await order("SP-LATER");
      const earlier = await order("SP-EARLIER", "2026-10-01T00:00:00Z");
      const [receipt] =
        await sql`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id)
        values(${earlier.id},${account!.id},100,'Bank ref #42','BANKREF42','owner') returning *`;
      await sql.begin(async (tx) => {
        for (const statement of migrations.at(-1)!.sql)
          if (statement.trim()) await tx.unsafe(statement);
      });
      expect(
        await sql`select reference_code from orders order by created_at,id`,
      ).toEqual([
        { reference_code: "ORD-000001" },
        { reference_code: "ORD-000002" },
      ]);
      expect(
        (await sql`select * from payment_receipts where id=${receipt!.id}`)[0],
      ).toMatchObject({
        ...receipt,
        reference_code: "PAY-000001",
      });
      const created = await Promise.all(
        Array.from({ length: 16 }, () => order()),
      );
      expect(new Set(created.map((row) => row.reference_code)).size).toBe(16);
      expect(
        created.every((row) => /^ORD-\d{6}$/.test(row.reference_code)),
      ).toBe(true);
      const payments = await Promise.all(
        created.map(
          (
            row,
          ) => sql`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id)
        values(${row.id},${account!.id},100,${row.id},${row.id},'owner') returning reference_code`,
        ),
      );
      expect(
        new Set(payments.map((rows) => rows[0]!.reference_code)).size,
      ).toBe(16);
      expect(
        payments.every((rows) => /^PAY-\d{6}$/.test(rows[0]!.reference_code)),
      ).toBe(true);
      // Six digits is a minimum width; growing past it must never truncate.
      await sql`select setval('order_reference_sequence',999999,true),setval('payment_reference_sequence',999999,true)`;
      const millionth = await order();
      expect(millionth.reference_code).toBe("ORD-1000000");
      const [millionthPayment] =
        await sql`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id)
        values(${later.id},${account!.id},100,'overflow','OVERFLOW','owner') returning reference_code`;
      expect(millionthPayment!.reference_code).toBe("PAY-1000000");
      await expect(sql`insert into payment_receipts(order_id,payment_account_id,amount_cents,raw_reference,normalized_reference,recorded_by_user_id)
        values(${earlier.id},${account!.id},100,'duplicate','BANKREF42','owner')`).rejects.toThrow();
    } finally {
      await client?.end();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  }, 60000);
});
