import type { ActionKit, AirQualityReport, AlternativesResponse, AskResponse, ClaimCheck, CommuteDestination, CommuteReport, CompareResponse, Example, Lang, LocalityReport, NeighborhoodHealth, Report, ReportRequest } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const d = JSON.parse(text).detail;
      if (typeof d === "string") detail = d; // FastAPI error message
    } catch {
      /* not JSON */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function post<T>(url: string, body?: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => json<T>(r));
}

export const api = {
  examples: () => fetch("/api/examples").then((r) => json<Example[]>(r)),
  createReport: (req: ReportRequest) =>
    fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    }).then((r) => json<Report>(r)),
  translate: (id: string, lang: Lang) =>
    fetch(`/api/reports/${encodeURIComponent(id)}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    }).then((r) => json<Report>(r)),
  ask: (id: string, question: string, lang: Lang) =>
    fetch(`/api/reports/${encodeURIComponent(id)}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, lang }),
    }).then((r) => json<AskResponse>(r)),
  brochure: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`/api/reports/${encodeURIComponent(id)}/brochure`, { method: "POST", body: form }).then((r) =>
      json<{ claims: ClaimCheck[] }>(r),
    );
  },
  actions: (id: string) => post<ActionKit>(`/api/reports/${encodeURIComponent(id)}/actions`),
  alternatives: (id: string) => post<AlternativesResponse>(`/api/reports/${encodeURIComponent(id)}/alternatives`),
  compare: (ids: string[]) => post<CompareResponse>("/api/compare", { report_ids: ids }),
  locality: (lat: number, lng: number, label?: string, radius_m: number = 2500) =>
    post<LocalityReport>("/api/locality", { lat, lng, label: label || "Selected Location", radius_m }),
  commute: (origin_lat: number, origin_lng: number, destinations: CommuteDestination[]) =>
    post<CommuteReport>("/api/locality/commute", { origin_lat, origin_lng, destinations }),
  airQuality: (lat: number, lng: number) =>
    fetch(`/api/locality/air?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`).then((r) => json<AirQualityReport>(r)),
  neighborhoodHealth: (lat: number, lng: number) =>
    fetch(`/api/locality/neighborhood-health?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`).then((r) => json<NeighborhoodHealth>(r)),
  layers: (reportId: string, year?: string | null) => {
    const query = year ? `?year=${encodeURIComponent(year)}` : "";
    return fetch(`/api/reports/${encodeURIComponent(reportId)}/layers${query}`).then((r) => json<{ layers: Record<string, string> }>(r));
  },
  reportLocality: (reportId: string) =>
    fetch(`/api/reports/${encodeURIComponent(reportId)}/locality`).then((r) => json<LocalityReport>(r)),
  getReport: async (id: string): Promise<Report | null> => {
    const res = await fetch(`/api/reports/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    return json<Report>(res);
  },
};

export function newReportId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
