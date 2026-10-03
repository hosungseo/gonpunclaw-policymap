import { describe, expect, it } from "vitest";
import { EMPTY_MAP_URL_STATE, parseMapUrlState, serializeMapUrlState } from "@/lib/share/url-state";

describe("map url state codec", () => {
  it("serializes an empty state to an empty string", () => {
    expect(serializeMapUrlState(EMPTY_MAP_URL_STATE)).toBe("");
  });

  it("round-trips a full state", () => {
    const state = {
      categories: ["복지", "청년,돌봄"],
      valueRange: [10, 250] as [number, number],
      query: "서초",
      view: "table" as const,
      boundary: "sigg" as const,
      policyLayer: true,
      region: "46110",
    };
    const qs = serializeMapUrlState(state);
    expect(parseMapUrlState(qs)).toEqual(state);
  });

  it("treats an empty cat param as 'no categories selected' and a missing one as 'all'", () => {
    expect(parseMapUrlState("cat=").categories).toEqual([]);
    expect(parseMapUrlState("").categories).toBeNull();
  });

  it("ignores invalid numbers, views and boundary levels", () => {
    const state = parseMapUrlState("min=abc&max=5&view=chart&bnd=planet");
    expect(state.valueRange).toBeNull();
    expect(state.view).toBe("map");
    expect(state.boundary).toBeNull();
  });

  it("turns the policy layer on when a region is present", () => {
    expect(parseMapUrlState("region=46110").policyLayer).toBe(true);
  });

  it("drops categories that are not in the known list when one is provided", () => {
    expect(parseMapUrlState("cat=a,b", { categories: ["a"] }).categories).toEqual(["a"]);
  });

  it("accepts a URLSearchParams instance", () => {
    expect(parseMapUrlState(new URLSearchParams("q=x")).query).toBe("x");
  });
});
