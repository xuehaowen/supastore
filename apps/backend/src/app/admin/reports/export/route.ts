import { staffIdentity } from "@/infrastructure/web";
import { exportSalesReport } from "@/application/use-cases/reports/sales-report";
import { DomainError } from "@/domain/errors";
import { logger } from "@/infrastructure/security/logger";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const report = await exportSalesReport({
      actorUserId: await staffIdentity(),
      start: url.searchParams.get("start") ?? "",
      endExclusive: url.searchParams.get("end") ?? "",
      signal: request.signal,
    });
    return new Response(report, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=sales-report.csv",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const known = error instanceof DomainError;
    if (!known) logger.error("Sales report export failed", error);
    const status = known
      ? error.code === "UNAUTHORIZED"
        ? 401
        : error.code === "FORBIDDEN"
          ? 403
          : 400
      : 500;
    return new Response(known ? error.message : "Report unavailable", {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
