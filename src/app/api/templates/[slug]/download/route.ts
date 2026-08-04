import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { loadPolicyTemplate } from "@/lib/templates/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const template = await loadPolicyTemplate(slug);
  if (!template) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "템플릿을 찾을 수 없습니다." } }, { status: 404 });

  const headers = template.columns.map((column) => column.header);
  const rows = template.exampleRows.length > 0 ? template.exampleRows : [Object.fromEntries(headers.map((header) => [header, ""]))];
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  sheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, Math.min(32, header.length * 2 + 8)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "업로드");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const body = new Uint8Array(buffer);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="policymap-${slug}.xlsx"`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
