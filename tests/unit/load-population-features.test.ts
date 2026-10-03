import { beforeEach, describe, expect, it, vi } from "vitest";

// The loader memoises at module level, so each test gets a fresh module instance.
async function loadModule() {
  vi.resetModules();
  return import("@/lib/policy-layers/load-population-features");
}

function fixtureCollection(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { sig_cd: "51820", full_nm: "강원특별자치도 고성군" },
        geometry: { type: "Polygon", coordinates: [[[128, 38], [128.5, 38], [128.5, 38.5], [128, 38.5], [128, 38]]] },
      },
      {
        type: "Feature",
        properties: { sig_cd: "11650", full_nm: "서울특별시 서초구" },
        geometry: { type: "Polygon", coordinates: [[[127, 37], [127.1, 37], [127.1, 37.1], [127, 37.1], [127, 37]]] },
      },
    ],
  };
}

function stubFetch(ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, json: async () => fixtureCollection() });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("loadPopulationFeatureCollection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only known region codes and annotates them with policy properties", async () => {
    stubFetch();
    const { loadPopulationFeatureCollection } = await loadModule();
    const collection = await loadPopulationFeatureCollection();
    expect(collection.features).toHaveLength(1);
    const feature = collection.features[0];
    expect(feature.id).toBe("51820");
    expect(feature.properties?.policy_code).toBe("51820");
    expect(feature.properties?.policy_type).toBe("decline");
    expect(feature.properties?.policy_type_label).toBe("인구감소지역");
  });

  it("memoises the promise across calls", async () => {
    const fetchMock = stubFetch();
    const { loadPopulationFeatureCollection } = await loadModule();
    const [first, second] = await Promise.all([loadPopulationFeatureCollection(), loadPopulationFeatureCollection()]);
    await loadPopulationFeatureCollection();
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the cache after a failed load so a retry can succeed", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => fixtureCollection() });
    vi.stubGlobal("fetch", fetchMock);
    const { loadPopulationFeatureCollection } = await loadModule();
    await expect(loadPopulationFeatureCollection()).rejects.toThrow("boundary fetch failed");
    const collection = await loadPopulationFeatureCollection();
    expect(collection.features).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("builds a selection from a known feature and returns null for unknown codes", async () => {
    stubFetch();
    const { loadPopulationFeatureCollection, findPopulationFeature, selectionFromFeature } = await loadModule();
    const collection = await loadPopulationFeatureCollection();
    const known = findPopulationFeature(collection, "51820");
    expect(known).not.toBeNull();
    const selection = selectionFromFeature(known!);
    expect(selection).toMatchObject({ code: "51820", name: "고성군", fullName: "강원특별자치도 고성군", regionType: "decline" });
    expect(selection?.geometry.type).toBe("Polygon");

    expect(findPopulationFeature(collection, "11650")).toBeNull();
    expect(selectionFromFeature({ type: "Feature", properties: { policy_code: "11650" }, geometry: { type: "Point", coordinates: [0, 0] } })).toBeNull();
  });
});
