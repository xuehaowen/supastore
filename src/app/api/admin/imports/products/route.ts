import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  importProductsCsv,
  parseProductCsv,
} from "@/application/use-cases/catalog/import-products-csv";
import { auth } from "@/infrastructure/auth";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File exceeds 5 MB limit." }, { status: 413 });
  }

  const csvText = await file.text();
  const { rows, errors } = parseProductCsv(csvText);

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors }, { status: 422 });
  }

  try {
    const result = await importProductsCsv({ rows, staffUserId: session.user.id });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
