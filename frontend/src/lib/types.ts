// Mirrors backend/app/schemas.py. Keep in sync when the contract changes.

export type Level = "low" | "moderate" | "elevated" | "high";
export type Dimension = "water_body" | "flood" | "terrain" | "green" | "land_health" | "rain";
export type Confidence = "high" | "medium" | "low";
export type Lang = "en" | "hi" | "kn";
export type Status = "queued" | "evidence" | "investigating" | "verifying" | "done" | "partial" | "error";

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
  area_m2?: number;
}

export interface ReportRequest {
  lat: number;
  lng: number;
  radius_m: number;
  lang: Lang;
  report_id: string;
  label?: string;
  geometry?: GeoJSONPolygon;
}

export interface LandcoverYear {
  water: number;
  trees: number;
  grass: number;
  flooded_vegetation: number;
  crops: number;
  shrub_and_scrub: number;
  built: number;
  bare: number;
  snow_and_ice: number;
}

export interface LandcoverWindow {
  period: string;
  mean: LandcoverYear;
  green: number;
}

export interface LandcoverEvidence {
  source: string;
  resolution_m: number;
  by_year: Record<string, LandcoverYear>;
  green_by_year: Record<string, number>;
  comparison_windows?: { baseline: LandcoverWindow; recent: LandcoverWindow };
}

export interface TrendResult {
  slope_per_year: number;
  p_value: number;
  significant: boolean;
  n_years: number;
}

export interface LandHealthYear {
  ndvi_median: number | null;
  ndvi_p10: number | null;
  ndvi_p90: number | null;
  mndwi_median: number | null;
  ndmi_median: number | null;
  ndmi_dry: number | null;
  ndmi_wet: number | null;
  ndbi_median: number | null;
  lst_may_c: number | null;
  observations_s2: number;
  observations_lst: number;
}

export interface LandHealthEvidence {
  source: string;
  resolution_m: number;
  lst_source: string;
  lst_resolution_m: number;
  period: string;
  by_year: Record<string, LandHealthYear>;
  monthly_ndvi_climatology: Record<string, number>;
  trends: Partial<Record<"ndvi" | "mndwi" | "ndmi" | "ndbi" | "lst", TrendResult>>;
  context: { compare_radius_km: number; ndvi_percentile: number | null; lst_may_delta_c: number | null };
  ndvi_change: number | null;
}

export interface BuildingHistoryEvidence {
  source: string;
  resolution_m: number;
  period: string;
  by_year: Record<string, { presence_max: number; estimated_count: number; mean_height_m: number | null }>;
  first_detected_year: number | null;
  strongest_growth_year: number | null;
}

export interface HistoricFloodsEvidence {
  source: string;
  resolution_m: number;
  period: string;
  events: { event_id: number; year: number; flooded_fraction: number }[];
  max_flooded_fraction: number;
  latest_event_year: number | null;
}

export interface FloodHazardEvidence {
  source: string;
  resolution_m: number;
  period: string;
  return_period_years: number;
  exposed_fraction: number;
  inundation_depth_mean_m: number;
  inundation_depth_max_m: number;
}

export interface Evidence {
  landcover: LandcoverEvidence | null;
  land_health: LandHealthEvidence | null;
  water_years: { source: string; resolution_m: number; by_year: Record<string, number> } | null;
  water_months: { source: string; resolution_m: number; by_year: Record<string, (number | null)[]> } | null;
  jrc: { source: string; resolution_m: number; period: string; occurrence_core_pct: number; occurrence_area_pct: number; transition_core: string | null; years_water_core: number[] } | null;
  monsoon: { source: string; resolution_m: number; wet_months: number[]; season_basis: string; seen: number[]; observed_years: number; obs_per_year: Record<string, number> } | null;
  terrain: {
    source: string;
    resolution_m: number;
    plot_elevation_m: number;
    relative_height_500m_m: number;
    relative_height_2km_m: number;
    lower_than_500m_pct: number;
    lower_than_2km_pct: number;
    local_compare_radius_m: number;
    drainage_source: string;
    drainage_resolution_m: number;
    hand_m: number;
    compare_radius_km: number;
    lower_than_pct: number;
  } | null;
  buildings: BuildingHistoryEvidence | null;
  historic_floods: HistoricFloodsEvidence | null;
  flood_hazard: FloodHazardEvidence | null;
  s1: { source: string; resolution_m: number; event: string; flooded_fraction_aoi: number } | null;
  images: { year: number; url: string }[];
  vision: { year: number; water_visible: boolean; construction_stage: string; notes: string[] }[];
  rain: {
    source: string;
    resolution_m: number;
    climatology_period: string;
    monthly_climatology_mm: Record<string, number>;
    wet_months: number[];
    heavy_days_per_year_avg: number;
    max_3day_mm: number;
  } | null;
  embedding: { source: string; resolution_m: number; period: string; change: number; biggest_change_year: number | null } | null;
  news: { date: string; title: string; url: string }[];
  unavailable: string[];
}

export interface DimensionRating {
  level: Level;
  confidence: Confidence;
  sources: string[];
}

export interface RatingChange {
  dimension: Dimension;
  from: Level;
  to: Level;
  because: string[];
}

export interface Finding {
  id: string;
  dimension: Dimension;
  claim: string;
  evidence_refs: string[];
  severity: "info" | "watch" | "concern";
  confidence: Confidence;
  rating_change?: RatingChange | null;
}

export interface Verdict {
  overall: Level;
  headline: string;
  summary: string;
  check_next: string[];
  limitations: string[];
}

export interface Report {
  id: string;
  status: Status;
  location: { lat: number; lng: number; label: string | null; geometry?: GeoJSONPolygon | null };
  radius_m: number;
  lang: Lang;
  progress: { step: string; msg: string; ts: number }[];
  evidence: Evidence | null;
  ratings: Partial<Record<Dimension, DimensionRating>>;
  findings: Finding[];
  verdict: Verdict | null;
  verifier: { checked: number; passed: number; fixed: number; dropped: number; issues: string[] } | null;
  versions: Record<string, string>;
  evidence_sha256: string | null;
  translations: Partial<Record<Lang, Translation>>;
  actions: ActionKit | null;
  error: string | null;
  created_at: number;
}

export interface Example {
  id: string;
  label: string;
  city: string;
  lat: number;
  lng: number;
  radius_m: number;
  demo_data: boolean;
}

export const FINAL_STATUSES: Status[] = ["done", "partial", "error"];

export interface Translation {
  headline: string;
  summary: string;
  check_next: string[];
  findings: Record<string, string>;
}

export interface AskResponse {
  answer: string;
  evidence_refs: string[];
  refused: boolean;
}

export type ClaimVerdict = "supported" | "contradicted" | "partly" | "not_verifiable";

export interface ClaimCheck {
  text: string;
  category: string;
  verdict: ClaimVerdict;
  reason: string;
  evidence_refs: string[];
}

export interface ActionItem {
  text: string;
  why: string;
  evidence_refs: string[];
}

export interface ActionKit {
  checklist: ActionItem[];
  builder_questions: ActionItem[];
  share_text: string;
  generated_by: "gemini" | "template";
}

export interface Alternative {
  lat: number;
  lng: number;
  distance_km: number;
  bearing: string;
  overall: Level;
  ratings: Partial<Record<Dimension, Level>>;
  highlights: string[];
}

export interface AlternativesResponse {
  origin_overall: Level;
  alternatives: Alternative[];
  scanned: number;
  illustrative: boolean;
}

export interface CompareResponse {
  summary: string;
  best_id: string | null;
  generated_by: "gemini" | "template";
}

export type POICategory = "transit" | "education" | "grocery" | "healthcare" | "social" | "green";

export interface POIItem {
  id: string;
  name: string;
  category: POICategory;
  distance_m: number;
  lat: number;
  lng: number;
  detail?: string | null;
  rating?: number | null;
  ratings?: number | null;
  maps_uri?: string | null;
}

export interface AmenitySummary {
  /** "Google Places" or "OpenStreetMap". */
  source: string;
  nearest_metro: POIItem | null;
  nearest_bus: POIItem | null;
  nearest_grocery: POIItem | null;
  nearest_hospital: POIItem | null;
  nearest_school: POIItem | null;
  counts_by_category: Record<string, number>;
  pois: POIItem[];
}

export interface WebSource {
  title: string;
  url: string;
  domain: string;
}

/** What people write about the area (Gemini grounded on Google Search). Never part of the score. */
export interface CommunitySentiment {
  available: boolean;
  summary: string;
  pros: string[];
  cons: string[];
  sources: WebSource[];
  search_entry_html?: string | null;
}

export interface SubIndexScore {
  name: string;
  score: number;
  weight: number;
  status: "excellent" | "good" | "moderate" | "poor";
  summary: string;
}

export interface LocalityReport {
  id: string;
  lat: number;
  lng: number;
  label: string;
  radius_m: number;
  overall_score: number;
  verdict_headline: string;
  verdict_summary: string;
  sub_indices: Record<string, SubIndexScore>;
  amenities: AmenitySummary;
  sentiment: CommunitySentiment;
  created_at: number;
}

export type CommuteKind = "office" | "school" | "parents";

export interface CommuteDestination {
  kind: CommuteKind;
  label: string;
  lat: number;
  lng: number;
}

export interface CommuteTrip extends CommuteDestination {
  distance_km: number | null;
  drive_peak_minutes: number | null;
  drive_offpeak_minutes: number | null;
  peak_gap_minutes: number | null;
  transit_minutes: number | null;
  drive_peak_condition: string | null;
  drive_offpeak_condition: string | null;
  transit_condition: string | null;
}

export interface CommuteReport {
  source: "Google Routes API";
  checked_at: string;
  timezone: string;
  peak_departure_local: string;
  offpeak_departure_local: string;
  trips: CommuteTrip[];
}

export interface AirIndex {
  code: string;
  display_name: string;
  aqi: number | null;
  aqi_display: string;
  category: string;
  dominant_pollutant: string | null;
}

export interface AirPollutant {
  code: string;
  display_name: string;
  full_name: string;
  concentration: number;
  units: string;
}

export interface AirHistoryDay {
  date: string;
  aqi_mean: number;
  aqi_max: number;
  hours: number;
}

export interface AirNo2History {
  source: string;
  resolution_m: number;
  period: string;
  unit: "µmol/m²";
  by_year: Record<string, number>;
  trend: TrendResult | null;
}

export interface AirQualityReport {
  source: "Google Air Quality API";
  resolution_m: number;
  checked_at: string;
  current_at: string;
  timezone: string;
  region_code: string | null;
  index: AirIndex;
  pollutants: AirPollutant[];
  history_period: string;
  history_daily: AirHistoryDay[];
  no2: AirNo2History | null;
  unavailable: string[];
}

export interface NeighborhoodHealthYear {
  ndvi_median: number | null;
  lst_may_c: number | null;
}

export interface NeighborhoodHealth {
  source: string;
  resolution_m: number;
  lst_source: string;
  lst_resolution_m: number;
  period: string;
  radius_m: number;
  compare_radius_km: number;
  by_year: Record<string, NeighborhoodHealthYear>;
  recent_ndvi: number | null;
  greener_than_surroundings_pct: number | null;
  recent_lst_may_c: number | null;
  lst_may_delta_c: number | null;
  ndvi_trend: TrendResult | null;
  lst_trend: TrendResult | null;
}
