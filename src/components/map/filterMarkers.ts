import type { MarkerData } from "./MarkerLayer";

export interface MarkerDisplayFilters {
  selectedCategories: Set<string> | null;
  valueRange: [number, number] | null;
  searchQuery: string;
}

export function filterMarkersForDisplay(markers: MarkerData[], filters: MarkerDisplayFilters) {
  const q = filters.searchQuery.trim().toLowerCase();

  return markers.filter((marker) => {
    if (filters.selectedCategories) {
      if (!marker.category || !filters.selectedCategories.has(marker.category)) return false;
    }

    if (filters.valueRange) {
      if (marker.value == null) return false;
      if (marker.value < filters.valueRange[0] || marker.value > filters.valueRange[1]) return false;
    }

    if (!q) return true;

    const haystack = [marker.name, marker.address_normalized, marker.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
