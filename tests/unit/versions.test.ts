import { describe, expect, it } from "vitest";
import { diffVersionSnapshots, type MapVersionSnapshot } from "@/lib/versions";

const marker = (row_index: number, lat: number, included = true) => ({
  row_index,
  address_raw: `주소 ${row_index}`,
  address_normalized: `정규화 ${row_index}`,
  lat,
  lng: 127,
  name: `이름 ${row_index}`,
  value: row_index,
  category: "분류",
  extra: {},
  geocoder_used: "test",
  quality_status: "success" as const,
  quality_reason: null,
  included,
  original_address: `주소 ${row_index}`,
  manual_corrected: false,
});

const snapshot = (markers: ReturnType<typeof marker>[]): MapVersionSnapshot => ({ map: {}, markers, failures: [] });

describe("PolicyMap 버전 변경점", () => {
  it("separates additions, deletions, content changes and coordinate changes", () => {
    const before = snapshot([marker(1, 36), marker(2, 37), marker(4, 38)]);
    const after = snapshot([marker(1, 36.1), marker(2, 37, false), marker(3, 35)]);
    expect(diffVersionSnapshots(before, after)).toMatchObject({ added: 1, deleted: 1, updated: 2, coordinateChanged: 1, includedChanged: 1 });
  });
});
