import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { streamOrdersCsv } from "@/application/use-cases/catalog/export-csv";
import { exportOrdersXlsx } from "@/application/use-cases/catalog/export-orders-xlsx";
import { auth } from "@/infrastructure/auth";
import { db } from "@/infrastructure/db";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { ForbiddenError } from "@/application/common/errors";
import { DomainError } from "@/domain/errors";
import { textIterableStream } from "@/infrastructure/http/iterable-stream";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await db.transaction((tx) =>
      verifyStaffInTransaction(tx, session.user.id, "owner"),
    );
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

  const format = new URL(request.url).searchParams.get("format");
  const date = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    let workbook: ArrayBuffer;
    try {
      workbook = await exportOrdersXlsx();
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      return NextResponse.json(
        { error: error.message },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new NextResponse(workbook, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="orders-${date}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const filename = `orders-${date}.csv`;

  const stream = textIterableStream(streamOrdersCsv());

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
