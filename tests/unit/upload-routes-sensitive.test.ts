import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

function sensitiveCsvFile() {
  return new File(
    ["주소,이름,대표값,분류,전화번호\n서울 서초구 반포대로 58,예시복지관,48,복지,010-0000-0000\n"],
    "sensitive.csv",
    { type: "text/csv" },
  );
}

function formRequest(url: string): NextRequest {
  const fd = new FormData();
  fd.set("title", "민감정보 테스트");
  fd.set("file", sensitiveCsvFile());
  return new Request(url, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.77" },
    body: fd,
  }) as unknown as NextRequest;
}

describe("upload routes sensitive column rejection", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_TOKEN_PEPPER = "pepper";
  });

  it("rejects sensitive headers in asynchronous upload jobs before persistence", async () => {
    const { POST } = await import("@/app/api/upload/jobs/route");
    const res = await POST(formRequest("http://localhost/api/upload/jobs"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string; message: string } };
    expect(json.error.code).toBe("SENSITIVE_HEADERS");
    expect(json.error.message).toContain("전화번호");
  });

  it("rejects sensitive headers in the legacy upload endpoint before persistence", async () => {
    const { POST } = await import("@/app/api/upload/route");
    const res = await POST(formRequest("http://localhost/api/upload"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { ok: false; error: { code: string; message: string } };
    expect(json.error.code).toBe("SENSITIVE_HEADERS");
    expect(json.error.message).toContain("전화번호");
  });
});
