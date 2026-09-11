import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/infrastructure/db";
import { paymentUploadIntents } from "@/infrastructure/db/schema";
import { staffIdentity } from "@/infrastructure/web";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { presignDownload } from "@/infrastructure/storage";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staff = await staffIdentity();
    const { id } = await params;
    const key = await db.transaction(async (tx) => {
      await verifyStaffInTransaction(tx, staff);
      const [intent] = await tx
        .select()
        .from(paymentUploadIntents)
        .where(eq(paymentUploadIntents.id, id));
      return intent?.status === "finalized" ? intent.finalKey : null;
    });
    if (!key) return new NextResponse("Not found", { status: 404 });
    return NextResponse.redirect(await presignDownload(key));
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
