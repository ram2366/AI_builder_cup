// Place search + reverse geocoding.
// Search: Google Places Autocomplete through our API (house- and building-level addresses), with
// Photon (OpenStreetMap) as a backup. Reverse geocoding: Photon, locality-level labels only.

export interface Place {
  id: string;
  name: string;
  detail: string;
  /** NaN for a Google suggestion until `resolvePlace` looks up its location. */
  lat: number;
  lng: number;
  /** Google place id; present on Google suggestions. */
  googleId?: string;
}

// One Places session spans the keystrokes and the final pick, so it bills as a single search.
let session = crypto.randomUUID();

async function googleSearch(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<Place[] | null> {
  const params = new URLSearchParams({ q, session });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lng", String(near.lng));
  }
  const res = await fetch(`/api/places/autocomplete?${params}`, { signal });
  if (!res.ok) return null; // Places not configured or down: fall back to Photon
  const items = (await res.json()) as { id: string; name: string; detail: string }[];
  return items.map((i) => ({ id: `g-${i.id}`, googleId: i.id, name: i.name, detail: i.detail, lat: NaN, lng: NaN }));
}

/** Fills in coordinates for a Google suggestion; other places pass through unchanged. */
export async function resolvePlace(p: Place): Promise<Place> {
  if (!p.googleId || Number.isFinite(p.lat)) return p;
  const res = await fetch(`/api/places/${encodeURIComponent(p.googleId)}?session=${session}`);
  session = crypto.randomUUID();
  if (!res.ok) throw new Error("Could not look up that place");
  const d = (await res.json()) as { lat: number; lng: number };
  return { ...p, lat: d.lat, lng: d.lng };
}

interface PhotonProps {
  osm_id?: number;
  name?: string;
  street?: string;
  housenumber?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: PhotonProps;
}

const BASE = "https://photon.komoot.io";

function toPlace(f: PhotonFeature, i: number): Place {
  const p = f.properties;
  const name = p.name ?? p.street ?? p.locality ?? p.district ?? p.city ?? "Unnamed place";
  const detail = [p.locality, p.district, p.city ?? p.county, p.state, p.country]
    .filter((x, j, a) => x && x !== name && a.indexOf(x) === j)
    .join(", ");
  const [lng, lat] = f.geometry.coordinates;
  return { id: `${p.osm_id ?? i}-${lat}-${lng}`, name, detail, lat, lng };
}

export async function searchPlaces(q: string, near?: { lat: number; lng: number }, signal?: AbortSignal): Promise<Place[]> {
  const google = await googleSearch(q, near, signal).catch((e) => {
    if ((e as Error).name === "AbortError") throw e;
    return null;
  });
  if (google) return google;
  const params = new URLSearchParams({ q, limit: "6", lang: "en" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`${BASE}/api/?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features: PhotonFeature[] };
  return data.features.map(toPlace);
}

/** Short human label for a point, e.g. "MSR Layout, Bangalore East". Locality-level only. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/reverse?lat=${lat}&lon=${lng}&lang=en`);
    if (!res.ok) return null;
    const data = (await res.json()) as { features: PhotonFeature[] };
    const p = data.features[0]?.properties;
    if (!p) return null;
    const parts = [p.locality ?? p.district, p.city ?? p.county, p.state].filter(Boolean);
    return [...new Set(parts)].slice(0, 3).join(", ") || null;
  } catch {
    return null;
  }
}
