"""Validation and canonicalisation for user-supplied plot boundaries."""

from __future__ import annotations

import hashlib
import json
import math

from shapely.geometry import Polygon
from shapely.geometry.polygon import orient
from shapely.validation import explain_validity

MIN_BOUNDARY_AREA_M2 = 200
MAX_BOUNDARY_AREA_M2 = 2_000_000
MAX_BOUNDARY_VERTICES = 200


def _projected_polygon(coordinates: list[list[tuple[float, float]]]) -> Polygon:
    """Use a local equirectangular projection; accurate enough for the 2 km² limit."""
    points = [point for ring in coordinates for point in ring[:-1]]
    mean_lat = sum(point[1] for point in points) / len(points)
    mean_lng = sum(point[0] for point in points) / len(points)
    x_scale = 111_320 * math.cos(math.radians(mean_lat))
    y_scale = 110_574

    def project(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
        return [((lng - mean_lng) * x_scale, (lat - mean_lat) * y_scale) for lng, lat in ring]

    return Polygon(project(coordinates[0]), [project(ring) for ring in coordinates[1:]])


def boundary_area_m2(coordinates: list[list[tuple[float, float]]]) -> float:
    return abs(_projected_polygon(coordinates).area)


def normalize_polygon_coordinates(value: object) -> list[list[tuple[float, float]]]:
    if not isinstance(value, (list, tuple)) or not value:
        raise ValueError("Boundary must contain at least one polygon ring")

    coordinates: list[list[tuple[float, float]]] = []
    vertex_count = 0
    for raw_ring in value:
        if not isinstance(raw_ring, (list, tuple)) or len(raw_ring) < 4:
            raise ValueError("Each boundary ring needs at least three points and a closing point")
        ring: list[tuple[float, float]] = []
        for raw_point in raw_ring:
            if not isinstance(raw_point, (list, tuple)) or len(raw_point) < 2:
                raise ValueError("Boundary coordinates must be [longitude, latitude] pairs")
            try:
                lng, lat = float(raw_point[0]), float(raw_point[1])
            except (TypeError, ValueError) as exc:
                raise ValueError("Boundary coordinates must be numbers") from exc
            if not math.isfinite(lng) or not math.isfinite(lat) or not -180 <= lng <= 180 or not -90 <= lat <= 90:
                raise ValueError("Boundary coordinates are outside valid longitude/latitude limits")
            ring.append((round(lng, 7), round(lat, 7)))
        if ring[0] != ring[-1]:
            raise ValueError("Boundary rings must be closed")
        vertex_count += len(ring) - 1
        coordinates.append(ring)

    if vertex_count > MAX_BOUNDARY_VERTICES:
        raise ValueError(f"Boundary has {vertex_count} points; the limit is {MAX_BOUNDARY_VERTICES}")

    polygon = Polygon(coordinates[0], coordinates[1:])
    if polygon.is_empty or not polygon.is_valid:
        reason = explain_validity(polygon)
        raise ValueError(f"Boundary is invalid or self-intersecting ({reason})")

    area = boundary_area_m2(coordinates)
    if area < MIN_BOUNDARY_AREA_M2:
        raise ValueError(f"Boundary is too small; draw at least {MIN_BOUNDARY_AREA_M2} m²")
    if area > MAX_BOUNDARY_AREA_M2:
        raise ValueError("Boundary is too large; the limit is 2 km²")

    canonical = orient(polygon, sign=1.0)
    return [
        [(round(lng, 7), round(lat, 7)) for lng, lat in canonical.exterior.coords],
        *[
            [(round(lng, 7), round(lat, 7)) for lng, lat in interior.coords]
            for interior in canonical.interiors
        ],
    ]


def boundary_hash(coordinates: list[list[tuple[float, float]]]) -> str:
    payload = json.dumps(coordinates, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()[:20]
