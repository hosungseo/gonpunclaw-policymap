export type LngLatPoint = [number, number];

function pointInRing(point: LngLatPoint, ring: LngLatPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = point;
    const [xi, yi] = ring[index];
    const [xj, yj] = ring[previous];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: LngLatPoint, polygon: LngLatPoint[][]): boolean {
  if (polygon.length === 0 || !pointInRing(point, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => pointInRing(point, hole));
}

export function pointInGeometry(point: LngLatPoint, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates as LngLatPoint[][]);
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as LngLatPoint[][][]).some((polygon) => pointInPolygon(point, polygon));
  return false;
}
