import { DomainError } from "@/domain/errors";

export interface OrderExportSelection {
  ids?: string[];
  search?: string;
  status?: "unpaid" | "confirmed" | "completed" | "cancelled";
}

export function parseOrderExportSelection(
  parameters: URLSearchParams,
): OrderExportSelection {
  const scope =
    parameters.get("scope") ?? (parameters.has("ids") ? "selected" : "all");
  if (!["selected", "filtered", "all"].includes(scope))
    throw new DomainError("Choose a valid export scope.");
  if (scope === "selected") {
    const ids = [
      ...new Set((parameters.get("ids") ?? "").split(",").filter(Boolean)),
    ];
    if (
      !ids.length ||
      ids.length > 50 ||
      ids.some(
        (id) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            id,
          ),
      )
    ) {
      throw new DomainError("Select between 1 and 50 valid orders to export.");
    }
    return { ids };
  }
  if (scope === "filtered") {
    const search = (parameters.get("q") ?? "").trim();
    const status = parameters.get("status") ?? "";
    if (
      search.length > 120 ||
      (status &&
        !["unpaid", "confirmed", "completed", "cancelled"].includes(status))
    )
      throw new DomainError("Choose valid order filters.");
    return {
      ...(search ? { search } : {}),
      ...(status
        ? { status: status as NonNullable<OrderExportSelection["status"]> }
        : {}),
    };
  }
  return {};
}
