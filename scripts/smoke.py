#!/usr/bin/env python3
"""Cheap end-to-end checks for a local or deployed SAMPAAA API."""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from collections.abc import Callable
from typing import Any


class SmokeFailure(RuntimeError):
    pass


class Smoke:
    def __init__(self, base_url: str, timeout_s: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_s = timeout_s
        self.failures = 0
        self.paid_request_groups = 0

    def request(
        self,
        path: str,
        *,
        method: str = "GET",
        body: dict[str, Any] | None = None,
        paid: bool = False,
    ) -> Any:
        if paid:
            # This counts calls from this script to paid-service-backed SAMPAAA endpoints.
            # Provider fan-out and cache hits happen inside the server and are not observable here.
            self.paid_request_groups += 1
        data = json.dumps(body).encode() if body is not None else None
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "User-Agent": "SAMPAAA-smoke/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s) as response:
                return json.loads(response.read().decode())
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")[:400]
            raise SmokeFailure(f"HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise SmokeFailure(str(exc)) from exc

    def check(self, label: str, fn: Callable[[], str | None]) -> None:
        started = time.monotonic()
        try:
            detail = fn()
            suffix = f" — {detail}" if detail else ""
            print(f"✓ {label}{suffix} ({time.monotonic() - started:.1f}s)")
        except Exception as exc:
            self.failures += 1
            print(f"✗ {label} — {exc} ({time.monotonic() - started:.1f}s)")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SmokeFailure(message)


def report_request(example: dict[str, Any], report_id: str) -> dict[str, Any]:
    return {
        "lat": example["lat"],
        "lng": example["lng"],
        "radius_m": example["radius_m"],
        "lang": "en",
        "report_id": report_id,
        "label": f'{example["label"]}, {example["city"]}',
    }


def validate_report(report: dict[str, Any], expected: str) -> str:
    require(report.get("status") in {"done", "partial"}, f'report status is {report.get("status")!r}')
    require(report.get("verdict", {}).get("overall") == expected, "unexpected overall level")
    require(report.get("evidence", {}).get("land_health") is not None, "land_health evidence is missing")
    require(report.get("ratings", {}).get("land_health") is not None, "land_health rating is missing")
    require(report.get("verifier", {}).get("dropped") == 0, "verifier dropped one or more findings")
    return f"{expected} level, land health present, verifier dropped 0"


def validate_layers(payload: dict[str, Any]) -> str:
    layers = payload.get("layers")
    require(isinstance(layers, dict) and layers, "no map layers returned")
    bad = [name for name, url in layers.items() if not isinstance(url, str) or not url.startswith("https://")]
    require(not bad, f"non-tile URLs for: {', '.join(bad)}")
    require(all(token in url for url in layers.values() for token in ("{z}", "{x}", "{y}")), "tile URL template is incomplete")
    return f"{len(layers)} HTTPS tile URLs"


def validate_locality(payload: dict[str, Any]) -> str:
    amenities = payload.get("amenities", {})
    source = amenities.get("source")
    require(source in {"Google Places", "OpenStreetMap"}, f"unexpected amenities source {source!r}")
    metro = amenities.get("nearest_metro")
    if metro is not None:
        detail = str(metro.get("detail") or "").lower()
        require(metro.get("category") == "transit", "nearest metro is not a transit place")
        require(any(kind in detail for kind in ("subway", "light rail", "metro")), "nearest metro is not subway/light rail")
        require("bus" not in detail, "a bus stop was labelled as metro")

    sentiment = payload.get("sentiment", {})
    if sentiment.get("available"):
        sources = sentiment.get("sources") or []
        require(bool(sentiment.get("summary")), "available sentiment has no summary")
        require(len(sources) >= 2, "available sentiment has fewer than two sources")
        require(all(str(item.get("url", "")).startswith("http") for item in sources), "sentiment source URL is missing")
    else:
        require(not sentiment.get("summary"), "unavailable sentiment contains an uncited summary")
        require(not sentiment.get("pros") and not sentiment.get("cons"), "unavailable sentiment contains opinions")
        require(not sentiment.get("sources"), "unavailable sentiment unexpectedly contains sources")
    return f"{source}; sentiment {'sourced' if sentiment.get('available') else 'honestly unavailable'}"


def validate_commute(payload: dict[str, Any]) -> str:
    require(payload.get("source") == "Google Routes API", "unexpected commute source")
    require(bool(payload.get("checked_at") and payload.get("timezone")), "commute timestamps are missing")
    trips = payload.get("trips")
    require(isinstance(trips, list) and len(trips) == 1, "expected one commute trip")
    fields = {
        "distance_km",
        "drive_peak_minutes",
        "drive_offpeak_minutes",
        "peak_gap_minutes",
        "transit_minutes",
    }
    require(fields <= trips[0].keys(), "commute fields are missing")
    return "Routes source and peak/off-peak/transit fields present"


def validate_air(payload: dict[str, Any]) -> str:
    require(payload.get("source") == "Google Air Quality API", "unexpected air source")
    require(bool(payload.get("checked_at") and payload.get("current_at")), "air timestamps are missing")
    index = payload.get("index")
    require(isinstance(index, dict), "current air index is missing")
    require({"code", "aqi", "category", "dominant_pollutant"} <= index.keys(), "air index fields are missing")
    require(isinstance(payload.get("pollutants"), list), "pollutant list is missing")
    require(isinstance(payload.get("history_daily"), list), "30-day history field is missing")
    require(isinstance(payload.get("unavailable"), list), "air unavailable list is missing")
    return f'{index.get("display_name", "AQI")} fields present'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base_url", nargs="?", default="http://localhost:8090")
    parser.add_argument("--timeout", type=int, default=180, help="per-request timeout in seconds")
    args = parser.parse_args()

    smoke = Smoke(args.base_url, args.timeout)
    started = time.monotonic()
    state: dict[str, Any] = {}

    def examples_check() -> str:
        examples = smoke.request("/api/examples")
        require(isinstance(examples, list), "response is not a list")
        by_id = {item.get("id"): item for item in examples}
        require("former-lake" in by_id and "high-ground" in by_id, "wetland or Basavanagudi example is missing")
        state["wetland"] = by_id["former-lake"]
        state["control"] = by_id["high-ground"]
        return f"{len(examples)} examples"

    smoke.check("examples", examples_check)

    def make_report(key: str, report_id: str, expected: str) -> str:
        example = state.get(key)
        require(isinstance(example, dict), "examples check did not provide this plot")
        report = smoke.request("/api/reports", method="POST", body=report_request(example, report_id))
        state[f"{key}_report"] = report
        return validate_report(report, expected)

    smoke.check("wetland report", lambda: make_report("wetland", "smoke-wetland-v2", "high"))
    smoke.check("Basavanagudi report", lambda: make_report("control", "smoke-basavanagudi-v2", "low"))

    def layers_check() -> str:
        details = []
        for key in ("wetland_report", "control_report"):
            report = state.get(key)
            require(isinstance(report, dict) and report.get("id"), f"{key} is unavailable")
            details.append(validate_layers(smoke.request(f'/api/reports/{urllib.parse.quote(report["id"])}/layers')))
        return "; ".join(details)

    smoke.check("report map layers", layers_check)

    session = uuid.uuid4().hex

    def autocomplete_check() -> str:
        params = urllib.parse.urlencode({"q": "Vidhana Soudha Bengaluru", "session": session})
        results = smoke.request(f"/api/places/autocomplete?{params}", paid=True)
        require(isinstance(results, list) and results, "Places returned no suggestions")
        require(all(item.get("id") and item.get("name") for item in results), "suggestion fields are missing")
        state["suggestion"] = results[0]
        return f"{len(results)} suggestions"

    smoke.check("Places autocomplete", autocomplete_check)

    def details_check() -> str:
        suggestion = state.get("suggestion")
        require(isinstance(suggestion, dict), "autocomplete did not provide a suggestion")
        path = f'/api/places/{urllib.parse.quote(str(suggestion["id"]))}?{urllib.parse.urlencode({"session": session})}'
        detail = smoke.request(path, paid=True)
        require(all(key in detail for key in ("id", "name", "detail", "lat", "lng")), "place detail fields are missing")
        require(isinstance(detail["lat"], (int, float)) and isinstance(detail["lng"], (int, float)), "coordinates are invalid")
        state["place"] = detail
        return detail["name"]

    smoke.check("Places details", details_check)

    def locality_check() -> str:
        place = state.get("place")
        require(isinstance(place, dict), "Places details are unavailable")
        locality = smoke.request(
            "/api/locality",
            method="POST",
            paid=True,
            body={"lat": place["lat"], "lng": place["lng"], "label": place["detail"] or place["name"], "radius_m": 2500},
        )
        state["locality"] = locality
        return validate_locality(locality)

    smoke.check("locality amenities and sentiment", locality_check)

    def commute_check() -> str:
        place = state.get("place")
        wetland = state.get("wetland")
        require(isinstance(place, dict) and isinstance(wetland, dict), "origin or destination is unavailable")
        payload = smoke.request(
            "/api/locality/commute",
            method="POST",
            paid=True,
            body={
                "origin_lat": place["lat"],
                "origin_lng": place["lng"],
                "destinations": [{"kind": "office", "label": wetland["label"], "lat": wetland["lat"], "lng": wetland["lng"]}],
            },
        )
        return validate_commute(payload)

    smoke.check("locality commute", commute_check)

    def air_check() -> str:
        place = state.get("place")
        require(isinstance(place, dict), "place is unavailable")
        params = urllib.parse.urlencode({"lat": place["lat"], "lng": place["lng"]})
        return validate_air(smoke.request(f"/api/locality/air?{params}", paid=True))

    smoke.check("locality air quality", air_check)

    print(f"Total time: {time.monotonic() - started:.1f}s")
    print(
        f"Paid API request groups made: {smoke.paid_request_groups} "
        "(server fan-out and cache hits are not visible to this client)"
    )
    if smoke.failures:
        print(f"Result: {smoke.failures} check(s) failed")
        return 1
    print("Result: all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
