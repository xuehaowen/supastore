import { randomUUID } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import { db } from "@/infrastructure/db";
import { databaseCursor } from "@/infrastructure/db/cursor";
import { verifyStaffInTransaction } from "@/infrastructure/auth/session";
import { logger } from "@/infrastructure/security/logger";
import { DomainError } from "@/domain/errors";
import { salesReportCsvHeader, salesReportCsvRow } from "@/domain/sales-report";
import { prepareSalesReport } from "./sales-report";
import { reportBudgets, reportRow } from "./report-workspace";

/** Finish an exact snapshot export before exposing headers; downloads hold no DB session. */
export async function spoolSalesReport(
  input: {
    actorUserId: string;
    start: string;
    endExclusive: string;
    signal?: AbortSignal;
  },
  directory = tmpdir(),
) {
  const budget = reportBudgets();
  if (input.signal?.aborted) throw new DomainError("Report cancelled.");
  const deadline = performance.now() + budget.timeoutMs;
  const path = join(directory, `supastore-sales-${randomUUID()}.csv`);
  const file = await open(path, "wx", 0o600);
  let closed = false;
  let bytes = 0;
  const cleanup = async () => {
    try {
      await unlink(path);
    } catch (error) {
      logger.error("Unable to remove temporary report export", error);
    }
  };
  async function write(chunk: string) {
    if (input.signal?.aborted) throw new DomainError("Report cancelled.");
    if (performance.now() > deadline)
      throw new DomainError(
        "Report export exceeded its time budget. Choose a smaller period.",
      );
    bytes += Buffer.byteLength(chunk, "utf8");
    if (bytes > budget.exportBytes)
      throw new DomainError(
        "Report export exceeded its file-size budget. Choose a smaller period.",
      );
    const deadlineSignal = AbortSignal.timeout(
      Math.max(1, Math.ceil(deadline - performance.now())),
    );
    const signal = input.signal
      ? AbortSignal.any([input.signal, deadlineSignal])
      : deadlineSignal;
    try {
      await file.writeFile(chunk, { signal });
    } catch (error) {
      if (input.signal?.aborted) throw new DomainError("Report cancelled.");
      if (deadlineSignal.aborted)
        throw new DomainError(
          "Report export exceeded its time budget. Choose a smaller period.",
        );
      throw error;
    }
  }
  try {
    if (input.signal?.aborted) throw new DomainError("Report cancelled.");
    await db.transaction(
      async (tx) => {
        await verifyStaffInTransaction(tx, input.actorUserId);
        const report = await prepareSalesReport(
          tx,
          input.start,
          input.endExclusive,
          input.signal,
        );
        await write(salesReportCsvHeader());
        let buffer: string[] = [];
        for await (const row of databaseCursor(
          tx,
          sql`SELECT * FROM ${report.table} ORDER BY date, id`,
        )) {
          buffer.push(salesReportCsvRow(reportRow(row)));
          if (buffer.length === 500) {
            await write(buffer.join(""));
            buffer = [];
          }
        }
        if (buffer.length) await write(buffer.join(""));
      },
      { isolationLevel: "repeatable read" },
    );
    await file.close();
    closed = true;
    if (input.signal?.aborted) throw new DomainError("Report cancelled.");
    const reader = createReadStream(path);
    const body = Readable.toWeb(reader, {
      strategy: {
        highWaterMark: 65536,
        size: (chunk: Uint8Array) => chunk.byteLength,
      },
    }) as ReadableStream<Uint8Array>;
    const abort = () => reader.destroy(new Error("Report cancelled."));
    input.signal?.addEventListener("abort", abort, { once: true });
    reader.once("close", () => {
      input.signal?.removeEventListener("abort", abort);
      void cleanup();
    });
    if (input.signal?.aborted) abort();
    return body;
  } catch (error) {
    if (!closed)
      await file
        .close()
        .catch((closeError: unknown) =>
          logger.error("Unable to close temporary report export", closeError),
        );
    await cleanup();
    throw error;
  }
}
