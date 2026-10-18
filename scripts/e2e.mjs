#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const requireFromFrontend = createRequire(new URL("../frontend/package.json", import.meta.url));
let chromium;
try {
  ({ chromium } = requireFromFrontend("playwright"));
} catch {
  console.error("Playwright is not installed. Run: cd frontend && npm install");
  process.exit(2);
}

const baseUrl = (process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:5173").replace(/\/$/, "");
const failureDir = path.join(scriptDir, "e2e-failures");
const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

const cover = (water, trees, grass, built, bare) => ({
  water,
  trees,
  grass,
  flooded_vegetation: 0,
  crops: 0,
  shrub_and_scrub: 0,
  built,
  bare,
  snow_and_ice: 0,
});

function reportFixture(request) {
  const oldCover = cover(0.34, 0.25, 0.16, 0.08, 0.17);
  const newCover = cover(0.03, 0.10, 0.08, 0.65, 0.14);
  const landHealthYear = (ndvi, lst) => ({
    ndvi_median: ndvi,
    ndvi_p10: ndvi - 0.08,
    ndvi_p90: ndvi + 0.08,
    mndwi_median: 0.02,
    ndmi_median: 0.08,
    ndmi_dry: 0.04,
    ndmi_wet: 0.12,
    ndbi_median: 0.25,
    lst_may_c: lst,
    observations_s2: 24,
    observations_lst: 4,
  });
  return {
    id: request.report_id,
    status: "done",
    location: { lat: request.lat, lng: request.lng, label: request.label || "E2E Search Place", geometry: request.geometry || null },
    radius_m: request.radius_m,
    lang: "en",
    progress: [],
    evidence: {
      landcover: {
        source: "Dynamic World annual mean class probabilities",
        resolution_m: 10,
        by_year: { "2016": oldCover, "2017": oldCover, "2024": newCover, "2025": newCover },
        green_by_year: { "2016": 0.41, "2017": 0.41, "2024": 0.18, "2025": 0.18 },
        comparison_windows: {
          baseline: { period: "2016–2017", mean: oldCover, green: 0.41 },
          recent: { period: "2024–2025", mean: newCover, green: 0.18 },
        },
      },
      land_health: {
        source: "Sentinel-2 SR Harmonized + Cloud Score+",
        resolution_m: 10,
        lst_source: "Landsat 8/9 Collection 2 Level 2 ST_B10",
        lst_resolution_m: 30,
        period: "2017–2025",
        by_year: { "2017": landHealthYear(0.46, 31.2), "2025": landHealthYear(0.31, 34.1) },
        monthly_ndvi_climatology: {},
        trends: {},
        context: { compare_radius_km: 2, ndvi_percentile: 32, lst_may_delta_c: 1.4 },
        ndvi_change: -0.15,
      },
      water_years: { source: "JRC Global Surface Water YearlyHistory", resolution_m: 30, by_year: { "1984": 0.42, "1990": 0.38, "2000": 0.28, "2010": 0.16, "2021": 0.04 } },
      water_months: null,
      jrc: { source: "JRC Global Surface Water v1.4", resolution_m: 30, period: "1984-2021", occurrence_core_pct: 42, occurrence_area_pct: 28, transition_core: "lost", years_water_core: [1984, 1990, 2000] },
      monsoon: { source: "Dynamic World, location-specific wet-season scenes", resolution_m: 10, wet_months: [6, 7, 8, 9, 10, 11], season_basis: "CHIRPS climatology", seen: [2018, 2019], observed_years: 8, obs_per_year: { "2018": 12, "2019": 11, "2020": 10, "2021": 12 } },
      terrain: { source: "FABDEM bare-earth elevation", resolution_m: 30, plot_elevation_m: 885, relative_height_500m_m: -1.8, relative_height_2km_m: -3.2, lower_than_500m_pct: 76, lower_than_2km_pct: 82, local_compare_radius_m: 500, drainage_source: "MERIT Hydro HAND", drainage_resolution_m: 90, hand_m: 2.1, compare_radius_km: 2, lower_than_pct: 82 },
      buildings: null,
      historic_floods: null,
      flood_hazard: null,
      s1: null,
      images: [],
      vision: [],
      rain: { source: "CHIRPS daily", resolution_m: 5500, climatology_period: "2015-2024", monthly_climatology_mm: {}, wet_months: [6, 7, 8, 9, 10, 11], heavy_days_per_year_avg: 1.2, max_3day_mm: 122 },
      embedding: { source: "AlphaEarth", resolution_m: 10, period: "2017-2024", change: 0.31, biggest_change_year: 2021 },
      news: [],
      unavailable: [],
    },
    ratings: {
      water_body: { level: "high", confidence: "high", sources: ["JRC"] },
      flood: { level: "low", confidence: "medium", sources: ["Dynamic World"] },
      terrain: { level: "low", confidence: "high", sources: ["FABDEM"] },
      green: { level: "low", confidence: "high", sources: ["Dynamic World"] },
      land_health: { level: "low", confidence: "medium", sources: ["Sentinel-2"] },
      rain: { level: "low", confidence: "low", sources: ["CHIRPS"] },
    },
    findings: [{ id: "f1", dimension: "water_body", claim: "Historic satellite records show water on this plot.", evidence_refs: ["jrc.occurrence_core_pct"], severity: "concern", confidence: "high", rating_change: null }],
    verdict: { overall: "high", headline: "Historic water is the clearest signal on this plot", summary: "The cited record shows a strong former-water signal.", check_next: [], limitations: ["E2E fixture: UI flow only"] },
    verifier: { checked: 1, passed: 1, fixed: 0, dropped: 0, issues: [] },
    versions: { pipeline: "e2e", evidence_provider: "mock", reasoner: "template", model: "" },
    evidence_sha256: "e2e",
    translations: {},
    actions: null,
    error: null,
    created_at: Date.now() / 1000,
  };
}

function localityFixture(body) {
  const second = body.label?.includes("Second");
  return {
    id: second ? "loc_e2e_second" : "loc_e2e_first",
    lat: body.lat,
    lng: body.lng,
    label: body.label,
    radius_m: 2500,
    overall_score: 74,
    verdict_headline: "Well served, with transit the weakest spot",
    verdict_summary: "Within 2.5 km (Google Places): measured amenities are available.",
    sub_indices: {
      essentials: { name: "Daily Essentials & Health", score: 80, weight: 0.3, status: "excellent", summary: "Measured nearby." },
      transit: { name: "Transit & Connectivity", score: 62, weight: 0.3, status: "moderate", summary: "Measured nearby." },
      education: { name: "Schools & Childcare", score: 76, weight: 0.2, status: "good", summary: "Measured nearby." },
      social: { name: "Dining, Cafes & Parks", score: 78, weight: 0.2, status: "good", summary: "Measured nearby." },
    },
    amenities: {
      source: "Google Places",
      nearest_metro: null,
      nearest_bus: null,
      nearest_grocery: null,
      nearest_hospital: null,
      nearest_school: null,
      counts_by_category: { transit: 0, education: 2, grocery: 3, healthcare: 2, social: 5, green: 1 },
      pois: [
        { id: "p-g1", name: "Fresh Basket", category: "grocery", distance_m: 250, lat: 12.9430, lng: 77.5740, detail: "Supermarket", rating: 4.3, ratings: 812, maps_uri: "https://maps.google.com/?cid=1" },
        { id: "p-g2", name: "Daily Mart", category: "grocery", distance_m: 420, lat: 12.9435, lng: 77.5745, detail: "Grocery store", rating: 4.0, ratings: 120, maps_uri: null },
        { id: "p-g3", name: "Organic Hub", category: "grocery", distance_m: 760, lat: 12.9440, lng: 77.5750, detail: "Grocery store", rating: 4.5, ratings: 90, maps_uri: null },
        { id: "p-h1", name: "City Clinic", category: "healthcare", distance_m: 180, lat: 12.9420, lng: 77.5735, detail: "Clinic", rating: 4.1, ratings: 55, maps_uri: null },
        { id: "p-e1", name: "Little Steps School", category: "education", distance_m: 330, lat: 12.9428, lng: 77.5730, detail: "School", rating: 4.4, ratings: 40, maps_uri: null },
      ],
    },
    sentiment: { available: false, summary: "", pros: [], cons: [], sources: [], search_entry_html: null },
    created_at: Date.now() / 1000,
  };
}

async function installRoutes(page) {
  let currentReport = null;
  await page.route("**/api/places/autocomplete?**", (route) => {
    const second = new URL(route.request().url()).searchParams.get("q")?.includes("Second");
    const place = second
      ? { id: "e2e-place-second", name: "Second E2E Locality", detail: "Bengaluru, Karnataka" }
      : { id: "e2e-place-first", name: "First E2E Locality", detail: "Bengaluru, Karnataka" };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([place]) });
  });
  await page.route("**/api/places/e2e-place-**?**", (route) => {
    const second = route.request().url().includes("e2e-place-second");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(second
        ? { id: "e2e-place-second", name: "Second E2E Locality", detail: "Bengaluru, Karnataka", lat: 12.976, lng: 77.640 }
        : { id: "e2e-place-first", name: "First E2E Locality", detail: "Bengaluru, Karnataka", lat: 12.9425, lng: 77.5737 }),
    });
  });
  await page.route("**/api/reports", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    currentReport = reportFixture(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(currentReport) });
  });
  await page.route("**/api/reports/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/ask")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          answer: "Historic water appears in this report's cited satellite records.",
          evidence_refs: ["jrc.occurrence_core_pct", "jrc.transition_core"],
          refused: false,
        }),
      });
    }
    if (route.request().url().includes("/layers")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ layers: {} }) });
    }
    if (!currentReport) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(currentReport) });
  });
  await page.route("**/api/locality", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(localityFixture(body)) });
  });
}

async function pickSearchPlace(page, query = "First E2E Locality") {
  const search = page.locator('input[aria-label="Search a place"]:visible').first();
  await search.fill(query);
  const option = page.getByRole("option").filter({ hasText: query });
  await option.getByRole("button").dispatchEvent("click");
  await page.getByText(`${query}, Bengaluru`, { exact: false }).first().waitFor();
}

const flows = [
  {
    name: "home loads",
    run: async (page) => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Every place has a history. Now, you can read it." }).waitFor();
      if ((await page.title()) !== "GeoMind") throw new Error(`Expected GeoMind page title, got ${await page.title()}`);
    },
  },
  {
    name: "search → pick → investigate → report",
    run: async (page) => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await pickSearchPlace(page);
      await page.getByRole("button", { name: /Analyse this plot/ }).click();
      await page.getByRole("heading", { name: "What stands out" }).waitFor({ timeout: 20_000 });
    },
  },
  {
    name: "report → Ask → suggested question answers without crashing",
    run: async (page) => {
      const browserErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
      });
      page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await pickSearchPlace(page);
      await page.getByRole("button", { name: /Analyse this plot/ }).click();
      await page.getByRole("heading", { name: "What stands out" }).waitFor({ timeout: 20_000 });
      await page.getByRole("tab", { name: "Ask" }).click();
      await page.getByRole("button", { name: "Does this area flood in heavy rain?" }).click();
      await page.getByText("Historic water appears in this report's cited satellite records.").waitFor();
      await page.waitForTimeout(250);

      const text = (await page.locator("body").innerText()).trim();
      if (!text || !text.includes("Gemini answers using only this report's evidence.")) {
        throw new Error("Ask tab became blank after the answer rendered");
      }
      if (browserErrors.length) throw new Error(browserErrors.join(" | "));
    },
  },
  {
    name: "draw a 4-point boundary → area appears",
    run: async (page) => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await pickSearchPlace(page);
      await page.getByRole("radio", { name: "Draw / import" }).click();
      await page.getByText("Click the map to draw the plot").waitFor();
      const canvas = page.locator("canvas.maplibregl-canvas");
      await canvas.waitFor();
      await page.waitForTimeout(4500); // let the fly-to land so the drawn shape is plot-sized
      const box = await canvas.boundingBox();
      if (!box) throw new Error("map canvas has no visible bounds");
      // Keep the drawn plot compact: the app correctly rejects the much larger city-block shape.
      // The workspace covers the left of the screen, so the plot sits right of centre.
      const points = [[0.66, 0.45], [0.70, 0.45], [0.70, 0.51], [0.66, 0.51], [0.66, 0.45]];
      for (const [x, y] of points) {
        await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
        await page.waitForTimeout(120);
      }
      await page.getByText("Custom boundary ready").waitFor({ timeout: 10_000 });
      await page.getByText(/m² · .* acres · .* guntas/).first().waitFor();
    },
  },
  {
    name: "locality opens",
    run: async (page) => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await pickSearchPlace(page);
      await page.getByRole("tab", { name: "Neighbourhood" }).click();
      await page.getByText(/Neighbourhood check · 2\.5 km/).waitFor();
    },
  },
  {
    name: "open 2 localities → compare shows both",
    run: async (page) => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await pickSearchPlace(page, "First E2E Locality");
      await page.getByRole("tab", { name: "Neighbourhood" }).click();
      await page.getByText(/Neighbourhood check · 2\.5 km/).waitFor();
      await page.getByRole("button", { name: "Add locality to compare" }).click();

      const clearSelection = page.getByRole("button", { name: "Clear selection" });
      await clearSelection.click();
      await clearSelection.waitFor({ state: "detached" });
      await page.getByRole("heading", { name: "Every place has a history. Now, you can read it." }).waitFor();
      await pickSearchPlace(page, "Second E2E Locality");
      await page.getByRole("tab", { name: "Neighbourhood" }).click();
      await page.getByText(/Neighbourhood check · 2\.5 km/).waitFor();
      await page.getByRole("button", { name: "Add locality to compare" }).click();

      await page.getByRole("button", { name: "Compare 2/3" }).click();
      const dialog = page.getByRole("dialog", { name: "Compare localities" });
      await dialog.getByText("First E2E Locality", { exact: false }).waitFor();
      await dialog.getByText("Second E2E Locality", { exact: false }).waitFor();
    },
  },
  {
    name: "neighbourhood: limit places per category and open a place's details",
    run: async (page) => {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await pickSearchPlace(page);
      await page.getByRole("tab", { name: "Neighbourhood" }).click();
      await page.getByText("Places on map").waitFor();
      await page.waitForTimeout(1500);
      const pills = page.locator(".ll-poi");
      if ((await pills.count()) !== 4) throw new Error(`expected 4 place pills with default limits, got ${await pills.count()}`);
      await page.locator("#places-grocery").fill("1");
      await page.waitForTimeout(300);
      if ((await pills.count()) !== 3) throw new Error(`expected 3 pills after limiting groceries to 1, got ${await pills.count()}`);
      await pills.filter({ hasText: "Fresh Basket" }).click();
      const card = page.getByRole("dialog", { name: "Fresh Basket details" });
      await card.getByText("250 m").waitFor();
      await card.getByText("Source: Google Places").waitFor();
      await card.getByRole("button", { name: "Close place details" }).click();
      await card.waitFor({ state: "detached" });
    },
  },
];

let browser;
try {
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
} catch (error) {
  console.error(`Could not launch Playwright Chromium: ${error.message}`);
  console.error("Set PLAYWRIGHT_CHROMIUM_EXECUTABLE or run: cd frontend && npx playwright install chromium");
  process.exit(2);
}

let failed = 0;
const started = performance.now();
for (const flow of flows) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await installRoutes(page);
  const flowStarted = performance.now();
  try {
    await flow.run(page);
    console.log(`✓ ${flow.name} (${((performance.now() - flowStarted) / 1000).toFixed(1)}s)`);
  } catch (error) {
    failed += 1;
    fs.mkdirSync(failureDir, { recursive: true });
    const slug = flow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const screenshot = path.join(failureDir, `${slug}.png`);
    await page.screenshot({ path: screenshot, fullPage: true }).catch(() => {});
    console.log(`✗ ${flow.name} — ${error.message} (${((performance.now() - flowStarted) / 1000).toFixed(1)}s)`);
    console.log(`  screenshot: ${screenshot}`);
  } finally {
    await context.close();
  }
}
await browser.close();
console.log(`Total time: ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log("Paid API calls made by e2e: 0 (heavy browser requests are mocked; scripts/smoke.py covers the real APIs)");
process.exit(failed ? 1 : 0);
