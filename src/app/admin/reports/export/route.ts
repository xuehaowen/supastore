import { staffIdentity } from "@/infrastructure/web";
import { generateSalesReport } from "@/application/use-cases/reports/sales-report";
import { salesReportCsv } from "@/domain/sales-report";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const report = await generateSalesReport({
      actorUserId: await staffIdentity(),
      start: url.searchParams.get("start") ?? "",
      endExclusive: url.searchParams.get("end") ?? "",
    });
    return new Response(salesReportCsv(report.rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=sales-report.csv",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Report unavailable", {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
