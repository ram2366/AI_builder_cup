import area from "@turf/area";
import kinks from "@turf/kinks";
import length from "@turf/length";
import simplify from "@turf/simplify";
import { kml } from "@tmcw/togeojson";
import type { Feature as GeoJSONFeature, LineString, MultiPolygon, Polygon } from "geojson";

export type BoundaryFeature = GeoJSONFeature<Polygon, Record<string, unknown>>;

export const MIN_BOUNDARY_AREA_M2 = 200;
export const MAX_BOUNDARY_AREA_M2 = 2_000_000;
export const MAX_BOUNDARY_VERTICES = 200;

export interface BoundaryMetrics {
  areaM2: number;
  acres: number;
  guntas: number;
  perimeterM: number;
  vertices: number;
}

function polygonFeature(coordinates: Polygon["coordinates"]): BoundaryFeature {
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } };
}

function normalizedCoordinates(coordinates: Polygon["coordinates"]): Polygon["coordinates"] {
  return coordinates.map((rawRing) => {
    const ring = rawRing.map(([lng, lat]) => [Number(lng), Number(lat)] as [number, number]);
    if (ring.length && (ring[0][0] !== ring.at(-1)?.[0] || ring[0][1] !== ring.at(-1)?.[1])) ring.push([...ring[0]]);
    return ring;
  });
}

export function boundaryMetrics(feature: BoundaryFeature): BoundaryMetrics {
  const ring: GeoJSONFeature<LineString> = {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: feature.geometry.coordinates[0] },
  };
  const areaM2 = area(feature);
  return {
    areaM2,
    acres: areaM2 / 4046.8564224,
    guntas: areaM2 / 101.17141056,
    perimeterM: length(ring, { units: "kilometers" }) * 1000,
    vertices: feature.geometry.coordinates.reduce((sum, points) => sum + Math.max(0, points.length - 1), 0),
  };
}

/** Area feedback for an unfinished polygon; validation still happens only when the user closes it. */
export function boundaryDraftMetrics(feature: BoundaryFeature): { metrics: BoundaryMetrics | null; vertices: number } {
  const raw = feature.geometry.coordinates[0] ?? [];
  const closed = raw.length > 1 && raw[0][0] === raw.at(-1)?.[0] && raw[0][1] === raw.at(-1)?.[1];
  const vertices = Math.max(0, raw.length - (closed ? 1 : 0));
  if (vertices < 3) return { metrics: null, vertices };
  const ring = raw.map(([lng, lat]) => [Number(lng), Number(lat)] as [number, number]);
  if (!closed) ring.push([...ring[0]]);
  return { metrics: boundaryMetrics(polygonFeature([ring])), vertices };
}

export function validateBoundary(input: BoundaryFeature): BoundaryFeature {
  const feature = polygonFeature(normalizedCoordinates(input.geometry.coordinates));
  const metrics = boundaryMetrics(feature);
  if (!feature.geometry.coordinates.length || feature.geometry.coordinates[0].length < 4) {
    throw new Error("A boundary needs at least three points.");
  }
  if (metrics.vertices > MAX_BOUNDARY_VERTICES) {
    throw new Error(`This boundary has ${metrics.vertices} points. The limit is ${MAX_BOUNDARY_VERTICES}.`);
  }
  if (kinks(feature).features.length > 0) throw new Error("The boundary crosses itself. Move the points so its edges do not cross.");
  if (metrics.areaM2 < MIN_BOUNDARY_AREA_M2) throw new Error("The boundary is too small. Draw at least 200 m².");
  if (metrics.areaM2 > MAX_BOUNDARY_AREA_M2) throw new Error("The boundary is too large. Keep it under 2 km².");
  return feature;
}

function simplifyToLimit(feature: BoundaryFeature): BoundaryFeature {
  let candidate = feature;
  let tolerance = 0.000001;
  while (boundaryMetrics(candidate).vertices > MAX_BOUNDARY_VERTICES && tolerance <= 0.005) {
    candidate = simplify(feature, { tolerance, highQuality: true, mutate: false }) as BoundaryFeature;
    tolerance *= 2;
  }
  return candidate;
}

function firstPolygon(features: GeoJSONFeature[]): BoundaryFeature | null {
  for (const feature of features) {
    if (feature.geometry?.type === "Polygon") return polygonFeature(feature.geometry.coordinates);
    if (feature.geometry?.type === "MultiPolygon") {
      const polygons = (feature.geometry as MultiPolygon).coordinates.map(polygonFeature);
      return polygons.sort((a, b) => area(b) - area(a))[0] ?? null;
    }
  }
  return null;
}

export function parseBoundaryFile(contents: string, filename: string): BoundaryFeature {
  let features: GeoJSONFeature[];
  if (filename.toLowerCase().endsWith(".kml")) {
    const document = new DOMParser().parseFromString(contents, "text/xml");
    if (document.querySelector("parsererror")) throw new Error("This KML file could not be read.");
    features = kml(document, { skipNullGeometry: true }).features as GeoJSONFeature[];
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new Error("This GeoJSON file could not be read.");
    }
    if (!parsed || typeof parsed !== "object") throw new Error("This file does not contain GeoJSON.");
    const geojson = parsed as { type?: string; features?: GeoJSONFeature[]; geometry?: Polygon | MultiPolygon };
    if (geojson.type === "FeatureCollection") features = geojson.features ?? [];
    else if (geojson.type === "Feature") features = [parsed as GeoJSONFeature];
    else if (geojson.type === "Polygon" || geojson.type === "MultiPolygon") {
      features = [{ type: "Feature", properties: {}, geometry: geojson as Polygon | MultiPolygon }];
    } else throw new Error("Use a KML or GeoJSON Polygon file.");
  }

  const polygon = firstPolygon(features);
  if (!polygon) throw new Error("No polygon boundary was found in this file.");
  return validateBoundary(simplifyToLimit(polygon));
}

export function boundaryCenter(feature: BoundaryFeature): { lat: number; lng: number } {
  const ring = feature.geometry.coordinates[0].slice(0, -1);
  const total = ring.reduce((sum, [lng, lat]) => ({ lng: sum.lng + lng, lat: sum.lat + lat }), { lng: 0, lat: 0 });
  return { lng: total.lng / ring.length, lat: total.lat / ring.length };
}
