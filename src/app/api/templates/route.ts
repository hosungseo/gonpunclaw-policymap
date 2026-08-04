import { NextResponse } from "next/server";
import { loadPolicyTemplates } from "@/lib/templates/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const templates = await loadPolicyTemplates();
  return NextResponse.json({
    ok: true,
    templates: templates.map(({ slug, title, audience, description, guidance, prohibitedColumns, columns }) => ({
      slug,
      title,
      audience,
      description,
      guidance,
      prohibitedColumns,
      columns,
    })),
  });
}
