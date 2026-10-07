import { eq } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { customers, user } from "@/infrastructure/db/schema";
import { DomainError } from "@/application/common/errors";
import { verifiedCustomer } from "./customer-ownership";

export function validateCustomerProfile(input: {
  name: string;
  phone: string;
}) {
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name || name.length > 100)
    throw new DomainError("Name must contain between 1 and 100 characters.");
  if (phone.length > 32 || (phone && !/^[+\d\s().-]+$/.test(phone)))
    throw new DomainError(
      "Enter a valid phone number of at most 32 characters.",
    );
  return { name, phone: phone || null };
}
export async function updateCustomerProfile(
  userId: string,
  input: { name: string; phone: string },
) {
  const profile = validateCustomerProfile(input);
  await db.transaction(async (tx) => {
    const customer = await verifiedCustomer(tx, userId);
    await tx
      .update(user)
      .set({ name: profile.name, updatedAt: new Date() })
      .where(eq(user.id, userId));
    await tx
      .update(customers)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(customers.id, customer.id));
  });
}
