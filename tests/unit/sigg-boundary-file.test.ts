import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("static sigungu boundary data", () => {
  it("ships simplified VWorld sigungu GeoJSON for the map overlay", () => {
    const filePath = path.join(process.cwd(), "public/data/sigg-boundaries.geojson");
    const stat = statSync(filePath);
    const geojson = JSON.parse(readFileSync(filePath, "utf8")) as {
      type: string;
      features: Array<{ properties?: { sig_cd?: string; full_nm?: string } }>;
    };

    expect(stat.size).toBeLessThan(3 * 1024 * 1024);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features.length).toBeGreaterThan(200);
    expect(geojson.features.some((feature) => feature.properties?.sig_cd === "11650")).toBe(true);
    expect(geojson.features.some((feature) => feature.properties?.full_nm === "서울특별시 서초구")).toBe(true);
  });
});
