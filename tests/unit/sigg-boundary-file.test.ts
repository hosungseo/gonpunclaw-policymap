import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("static administrative boundary data", () => {
  it("ships simplified VWorld sido GeoJSON for the map overlay", () => {
    const filePath = path.join(process.cwd(), "public/data/sido-boundaries.geojson");
    const stat = statSync(filePath);
    const geojson = JSON.parse(readFileSync(filePath, "utf8")) as {
      type: string;
      features: Array<{ properties?: { ctprvn_cd?: string; ctp_kor_nm?: string } }>;
    };

    expect(stat.size).toBeLessThan(3 * 1024 * 1024);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features.length).toBeGreaterThanOrEqual(17);
    expect(geojson.features.some((feature) => feature.properties?.ctprvn_cd === "11")).toBe(true);
    expect(geojson.features.some((feature) => feature.properties?.ctp_kor_nm === "서울특별시")).toBe(true);
  });

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

  it("ships simplified VWorld eupmyeondong GeoJSON for the detailed map overlay", () => {
    const filePath = path.join(process.cwd(), "public/data/emd-boundaries.geojson");
    const stat = statSync(filePath);
    const geojson = JSON.parse(readFileSync(filePath, "utf8")) as {
      type: string;
      features: Array<{ properties?: { emd_cd?: string; full_nm?: string; emd_kor_nm?: string } }>;
    };

    expect(stat.size).toBeLessThan(15 * 1024 * 1024);
    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features.length).toBeGreaterThan(3000);
    expect(geojson.features.some((feature) => feature.properties?.emd_cd === "11650108")).toBe(true);
    expect(geojson.features.some((feature) => feature.properties?.full_nm === "서울특별시 서초구 서초동")).toBe(true);
    expect(geojson.features.some((feature) => feature.properties?.emd_kor_nm === "서초동")).toBe(true);
  });
});
