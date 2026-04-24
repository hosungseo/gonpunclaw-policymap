"use client";
import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapViewProps {
  center?: [number, number];
  zoom?: number;
  onReady?: (map: MLMap) => void;
}

const DEFAULT_CENTER: [number, number] = [127.77, 36.2];

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, attribution: "© OpenStreetMap" },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
} as const;

export function MapView({ center = DEFAULT_CENTER, zoom = 6, onReady }: MapViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [centerLng, centerLat] = center;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: OSM_STYLE as unknown as maplibregl.StyleSpecification,
      center: [centerLng, centerLat],
      zoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => onReady?.(map));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [centerLng, centerLat, zoom, onReady]);

  return <div ref={ref} className="w-full h-full" />;
}
