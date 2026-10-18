export interface LatLng {
  lat: number;
  lng: number;
}

export interface Feature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
}

const M_PER_DEG_LAT = 111_320;

function offset(c: LatLng, dx: number, dy: number): [number, number] {
  const dLng = dx / (M_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180));
  return [c.lng + dLng, c.lat + dy / M_PER_DEG_LAT];
}

export function circlePolygon(center: LatLng, radiusM: number, steps = 96): Feature {
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push(offset(center, radiusM * Math.cos(t), radiusM * Math.sin(t)));
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

/** Smooth irregular blob, used to draw ILLUSTRATIVE evidence shapes in demo mode. */
export function blob(center: LatLng, radiusM: number, seed: number, steps = 120): Feature {
  const a = 0.22 + (seed % 7) / 60;
  const ph1 = seed * 1.7;
  const ph2 = seed * 0.9;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const r = radiusM * (1 + a * Math.sin(3 * t + ph1) + 0.12 * Math.sin(5 * t + ph2) + 0.06 * Math.sin(9 * t));
    ring.push(offset(center, r * Math.cos(t), r * Math.sin(t)));
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

export function shift(c: LatLng, dxM: number, dyM: number): LatLng {
  const [lng, lat] = offset(c, dxM, dyM);
  return { lat, lng };
}

type Line = [number, number][];
export interface LineFeatures {
  type: "FeatureCollection";
  features: { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "LineString"; coordinates: Line } }[];
}

function lines(ls: { coords: Line; major?: boolean }[]): LineFeatures {
  return {
    type: "FeatureCollection",
    features: ls.map((l) => ({ type: "Feature", properties: { major: !!l.major }, geometry: { type: "LineString", coordinates: l.coords } })),
  };
}

/** Latitude/longitude grid for the globe (every 15°, equator and prime meridian marked major). */
export function graticule(step = 15): LineFeatures {
  const out: { coords: Line; major?: boolean }[] = [];
  for (let lng = -180; lng <= 180; lng += step) {
    const c: Line = [];
    for (let lat = -80; lat <= 80; lat += 2) c.push([lng, lat]);
    out.push({ coords: c, major: lng === 0 });
  }
  for (let lat = -75; lat <= 75; lat += step) {
    const c: Line = [];
    for (let lng = -180; lng <= 180; lng += 2) c.push([lng, lat]);
    out.push({ coords: c, major: lat === 0 });
  }
  return lines(out);
}

/** HUD-style range ring: radial ticks around the analysis circle plus an outer dashed ring. */
export function rangeTicks(center: LatLng, radiusM: number): LineFeatures {
  const out: { coords: Line; major?: boolean }[] = [];
  for (let deg = 0; deg < 360; deg += 10) {
    const t = (deg * Math.PI) / 180;
    const major = deg % 90 === 0;
    const r0 = radiusM * (major ? 1.0 : 1.03);
    const r1 = radiusM * (major ? 1.16 : 1.08);
    out.push({ coords: [offset(center, r0 * Math.sin(t), r0 * Math.cos(t)), offset(center, r1 * Math.sin(t), r1 * Math.cos(t))], major });
  }
  const ring: Line = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * 2 * Math.PI;
    ring.push(offset(center, radiusM * 1.22 * Math.cos(t), radiusM * 1.22 * Math.sin(t)));
  }
  out.push({ coords: ring });
  return lines(out);
}
