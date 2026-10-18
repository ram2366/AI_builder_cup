import * as maplibregl from "maplibre-gl";

/**
 * Google Map Tiles API (2D) for the MapLibre globe. Tiles are fetched through custom protocols
 * (`gsat://`, `groad://`) so the style can be built synchronously while the session token is
 * created lazily on the first tile. Without VITE_GOOGLE_MAPS_KEY the app keeps the Esri fallback.
 */
export const GOOGLE_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? "";
export const hasGoogleTiles = GOOGLE_KEY.length > 0;

export type GoogleKind = "satellite" | "roadmap";

const API = "https://tile.googleapis.com";

// Night palette matching the app chrome (ink-950 ground, muted cyan water, quiet labels).
const DARK_ROADMAP = [
  { stylers: [{ saturation: -40 }] },
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8b9bb0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#05080f" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a2e3d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2636" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#24364a" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#0f1a28" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#0d2420" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#16202e" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#2a3a4f" }] },
];

const SESSION_BODY: Record<GoogleKind, object> = {
  satellite: { mapType: "satellite", language: "en-US", region: "IN", layerTypes: ["layerRoadmap"] },
  roadmap: { mapType: "roadmap", language: "en-US", region: "IN", styles: DARK_ROADMAP },
};

const sessions = new Map<GoogleKind, Promise<string>>();

async function createSession(kind: GoogleKind): Promise<string> {
  const cacheKey = `gtile-session-${kind}`;
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) ?? "null") as { s: string; exp: number } | null;
    if (cached && cached.exp > Date.now() / 1000 + 3600) return cached.s;
  } catch {
    /* storage unavailable: just create a new session */
  }
  const res = await fetch(`${API}/v1/createSession?key=${GOOGLE_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(SESSION_BODY[kind]),
  });
  if (!res.ok) throw new Error(`Google tiles session failed (${res.status})`);
  const body = (await res.json()) as { session: string; expiry: string };
  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ s: body.session, exp: Number(body.expiry) }));
  } catch {
    /* ignore */
  }
  return body.session;
}

export function session(kind: GoogleKind): Promise<string> {
  let p = sessions.get(kind);
  if (!p) {
    p = createSession(kind);
    p.catch(() => sessions.delete(kind)); // let the next tile retry
    sessions.set(kind, p);
  }
  return p;
}

let registered = false;
/** Registers gsat:// and groad:// once. Safe to call repeatedly. */
export function registerGoogleProtocols() {
  if (registered || !hasGoogleTiles) return;
  registered = true;
  const handler = (kind: GoogleKind) => async (params: { url: string }, abort: AbortController) => {
    const [z, x, y] = params.url.split("://")[1].split("/");
    const s = await session(kind);
    const res = await fetch(`${API}/v1/2dtiles/${z}/${x}/${y}?session=${s}&key=${GOOGLE_KEY}`, { signal: abort.signal });
    if (!res.ok) throw new Error(`tile ${res.status}`);
    // Raster sources render raw ArrayBuffers from custom protocols as black; hand over a decoded bitmap.
    return { data: await createImageBitmap(await res.blob()) };
  };
  maplibregl.addProtocol("gsat", handler("satellite"));
  maplibregl.addProtocol("groad", handler("roadmap"));
}

/** Google's required copyright line for what is on screen. */
export async function viewportCopyright(kind: GoogleKind, b: maplibregl.LngLatBounds, zoom: number): Promise<string> {
  const s = await session(kind);
  const q = new URLSearchParams({
    session: s,
    key: GOOGLE_KEY,
    zoom: String(Math.max(0, Math.round(zoom))),
    north: String(Math.min(85, b.getNorth())),
    south: String(Math.max(-85, b.getSouth())),
    east: String(b.getEast()),
    west: String(b.getWest()),
  });
  const res = await fetch(`${API}/tile/v1/viewport?${q}`);
  if (!res.ok) return "Map data ©Google";
  const body = (await res.json()) as { copyright?: string };
  return body.copyright ?? "Map data ©Google";
}
