"""What people say about a locality: Gemini grounded on Google Search.

Gemini may only use what the search returns, and every answer carries the real pages it read.
If grounding fails or finds too little, the section is marked unavailable; nothing is templated.
"""

import json
import logging
import re
from urllib.parse import urlparse

from google.genai import types

from app.agent import llm
from app.schemas import CommunitySentiment, WebSource
from app.services import places

log = logging.getLogger(__name__)

MIN_SOURCES = 2

PROMPT = """You help someone deciding whether to rent or buy a home in {area} (the address they
looked up: {place}). Search the web for what residents and recent reviews say about living in {area}
(forums such as Reddit, property-portal locality reviews, local news). Use ONLY what you find in the search results; if the
results say little, say so and keep the lists short. Do not use general knowledge about the city.

Reply with only a JSON object, no prose around it:
{{"summary": "2 sentences on what living there is like, as residents describe it",
  "pros": ["up to 4 specific things residents praise"],
  "cons": ["up to 4 specific complaints or watch-outs residents raise"]}}"""


def _domain(title: str, uri: str) -> str:
    # Grounding URLs are Google redirects; the chunk title carries the source domain.
    if "." in title and " " not in title:
        return title.lower().removeprefix("www.")
    return urlparse(uri).netloc.removeprefix("www.")


def _parse(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object in grounded answer")
    data = json.loads(m.group(0))
    return {
        "summary": str(data.get("summary", "")).strip(),
        "pros": [str(x).strip() for x in data.get("pros", []) if str(x).strip()][:4],
        "cons": [str(x).strip() for x in data.get("cons", []) if str(x).strip()][:4],
    }


def analyze_sentiment(label: str, lat: float | None = None, lng: float | None = None) -> CommunitySentiment:
    if not llm.agent_enabled():
        return CommunitySentiment()
    try:
        area = None
        if lat is not None and lng is not None:
            try:
                area = places.neighbourhood(lat, lng)
            except Exception as exc:  # the address itself still works as a search
                log.info("neighbourhood lookup failed: %s", exc)
        res = llm.get_client().models.generate_content(
            model=llm.model_name(),
            contents=PROMPT.format(area=area or label, place=label),
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                temperature=0.2,
                # Grounded answers run several searches; the client's default 25 s is too short.
                http_options=types.HttpOptions(timeout=60_000),
            ),
        )
        gm = res.candidates[0].grounding_metadata if res.candidates else None
        sources: list[WebSource] = []
        seen: set[str] = set()
        for ch in (gm.grounding_chunks or []) if gm else []:
            web = ch.web
            if not web or not web.uri or web.uri in seen:
                continue
            seen.add(web.uri)
            title = web.title or ""
            sources.append(WebSource(title=title, url=web.uri, domain=_domain(title, web.uri)))
        if len(sources) < MIN_SOURCES:
            log.info("grounded sentiment for %s found only %d sources", label, len(sources))
            return CommunitySentiment()
        draft = _parse(res.text or "")
        if not draft["summary"]:
            return CommunitySentiment()
        entry = gm.search_entry_point.rendered_content if gm and gm.search_entry_point else None
        return CommunitySentiment(available=True, sources=sources[:8], search_entry_html=entry, **draft)
    except Exception as exc:
        log.warning("grounded sentiment failed for %s: %s", label, exc)
        return CommunitySentiment()
