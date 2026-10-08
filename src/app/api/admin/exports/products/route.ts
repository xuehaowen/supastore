import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { streamProductsCsv } from "@/application/use-cases/catalog/export-csv";
import { auth } from "@/infrastructure/auth";
import { db } from "@/infrastructure/db";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { ForbiddenError } from "@/application/common/errors";

export async function GET(_request: NextRequest) {
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

  const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamProductsCsv()) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
