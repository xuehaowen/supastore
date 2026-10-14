import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  importProductsCsv,
  parseProductCsv,
} from "@/application/use-cases/catalog/import-products-csv";
import { auth } from "@/infrastructure/auth";
import { db } from "@/infrastructure/db";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { ForbiddenError, DomainError } from "@/application/common/errors";
import { revalidateTag, revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  const expectedOrigin = new URL(process.env.APP_URL || request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db.transaction((tx) => verifyStaffInTransaction(tx, session.user.id));
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { error: "Staff access required" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Unable to verify access" },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "A CSV file is required." },
      { status: 400 },
    );
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File exceeds 5 MB limit." },
      { status: 413 },
    );
  }

  const csvText = await file.text();
  const { rows, errors } = parseProductCsv(csvText);

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 422 });
  }

  try {
    const result = await importProductsCsv({
      rows,
      staffUserId: session.user.id,
    });
    revalidateTag("catalog");
    revalidatePath("/[locale]", "layout");
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof DomainError
            ? error.message
            : "Import failed. Please try again.",
      },
      { status: error instanceof DomainError ? 422 : 500 },
    );
  }
}
