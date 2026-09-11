import { type NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { streamOrdersCsv } from "@/application/use-cases/catalog/export-csv";
import { auth } from "@/infrastructure/auth";

export async function GET(_request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamOrdersCsv()) {
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
