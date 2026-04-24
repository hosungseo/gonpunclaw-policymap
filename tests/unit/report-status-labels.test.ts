import { describe, expect, it } from "vitest";
import { reportStatusLabel } from "@/lib/reports/status";

describe("report status labels", () => {
  it("uses Korean labels for staff-facing report states", () => {
    expect(reportStatusLabel("pending")).toBe("대기");
    expect(reportStatusLabel("reviewed")).toBe("검토 중");
    expect(reportStatusLabel("dismissed")).toBe("기각");
    expect(reportStatusLabel("resolved")).toBe("해결");
  });

  it("falls back to the raw status for unexpected stored values", () => {
    expect(reportStatusLabel("custom")).toBe("custom");
  });
});
