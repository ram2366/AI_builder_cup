"""The Investigator: an ADK agent that decides which follow-up checks to run.

Tool results are written back into the evidence pack, so later findings can cite them and the
verifier can check them. A hard budget on tool calls and a timeout keep it fast and predictable.
"""

import asyncio
import calendar
import json
from collections.abc import Callable

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.adk.tools import FunctionTool
from google.genai import types

from app.agent import llm, prompts
from app.config import get_settings
from app.schemas import Dimension, DimensionRating, Evidence, ReportRequest
from app.tools.provider import Drilldowns

ProgressFn = Callable[[str, str], None]


class Investigation:
    def __init__(
        self,
        req: ReportRequest,
        evidence: Evidence,
        ratings: dict[Dimension, DimensionRating],
        drill: Drilldowns,
        progress: ProgressFn,
    ) -> None:
        self.req = req
        self.evidence = evidence
        self.ratings = ratings
        self.drill = drill
        self.progress = progress
        self.max_calls = get_settings().agent_max_tool_calls
        self.calls = 0

    # ---- tools (names, docstrings and type hints become the function declarations) ----

    def _spend(self) -> dict | None:
        if self.calls >= self.max_calls:
            return {"error": "Tool budget used up. Write your investigation notes now."}
        self.calls += 1
        return None

    def tools(self) -> list[Callable]:
        def check_wet_season_year(year: int) -> dict:
            """Location-specific wet-season satellite observations for one year inside the area:
            how many cloud-free observations exist and whether surface water was seen."""
            if err := self._spend():
                return err
            self.progress("agent", f"Agent: checking the {year} wet-season scenes")
            return self.drill.water_by_year(year)

        def radar_flood_check(start_date: str, end_date: str) -> dict:
            """Sentinel-1 radar flood check between two dates (YYYY-MM-DD). Radar sees through monsoon
            clouds. Returns the fraction of the area that looked flooded and the event date."""
            if err := self._spend():
                return err
            self.progress("agent", f"Agent: radar flood check {start_date} to {end_date} (Sentinel-1)")
            res = self.drill.radar_flood_check(start_date, end_date)
            if res is None:
                return {"available": False}
            cur = self.evidence.s1
            if cur is None or res.flooded_fraction_aoi > cur.flooded_fraction_aoi:
                self.evidence.s1 = res
            return res.model_dump()

        def landcover_for_year(year: int) -> dict:
            """Detailed land-cover shares (0-1) inside the area for one year (Dynamic World)."""
            if err := self._spend():
                return err
            self.progress("agent", f"Agent: looking closer at land cover in {year}")
            res = self.drill.landcover_detail(year)
            return res.model_dump() if res else {"available": False}

        def search_local_news() -> dict:
            """Search news for reports of flooding or waterlogging at this location's place name.
            Use only to corroborate satellite signals."""
            place = self.req.label
            if not place:
                return {"error": "No place name is known for this location; news search is unavailable."}
            if err := self._spend():
                return err
            self.progress("agent", f"Agent: searching local news for {place}")
            items = self.drill.local_news(place)
            known = {n.url for n in self.evidence.news}
            self.evidence.news += [n for n in items if n.url not in known]
            return {"place": place, "results": [n.model_dump() for n in items]}

        return [check_wet_season_year, radar_flood_check, landcover_for_year, search_local_news]

    # ---- run ----

    def brief(self) -> str:
        ev = self.evidence.model_dump(mode="json", exclude={"images"})
        ratings = {d: r.model_dump() for d, r in self.ratings.items()}
        place = self.req.label or "unknown (no place name; skip news search)"
        return (
            f"Location: {self.req.lat:.5f}, {self.req.lng:.5f}; place name: {place}; "
            f"radius {self.req.radius_m} m.\n\n"
            f"Baseline ratings (rules):\n{json.dumps(ratings)}\n\n"
            f"Evidence pack:\n{json.dumps(ev)}"
        )

    async def _run(self, model: str) -> str:
        llm.get_client()  # makes sure credentials are in the environment for ADK
        agent = LlmAgent(
            name="landlens_investigator",
            model=model,
            instruction=prompts.INVESTIGATOR.format(max_calls=self.max_calls),
            tools=[FunctionTool(f) for f in self.tools()],
            generate_content_config=types.GenerateContentConfig(
                temperature=0.2, thinking_config=types.ThinkingConfig(thinking_level="low")
            ),
        )
        runner = InMemoryRunner(agent=agent, app_name="landlens")
        session = await runner.session_service.create_session(app_name="landlens", user_id="buyer")
        message = types.Content(role="user", parts=[types.Part(text=self.brief())])
        notes: list[str] = []
        async for event in runner.run_async(user_id="buyer", session_id=session.id, new_message=message):
            if event.is_final_response() and event.content and event.content.parts:
                notes += [p.text for p in event.content.parts if p.text]
        return "\n".join(notes).strip()

    def run(self) -> str:
        timeout = get_settings().agent_timeout_s
        return llm.with_fallback(lambda m: asyncio.run(asyncio.wait_for(self._run(m), timeout=timeout)))


def default_drilldowns(
    req: ReportRequest, evidence: Evidence, drill: Drilldowns, progress: ProgressFn
) -> None:
    """What the template pipeline checks when the agent is off (or failed part-way): radar for the
    latest observed wet season and local news when a place name is known. Skips anything already done."""
    wet = evidence.monsoon.seen if evidence.monsoon else []
    if wet and evidence.s1 is None:
        y = max(wet)
        months = evidence.monsoon.wet_months
        first_month, last_month = min(months), max(months)
        last_day = calendar.monthrange(y, last_month)[1]
        progress("drilldown", f"Radar flood check, {y} local wet season (Sentinel-1)")
        res = drill.radar_flood_check(
            f"{y}-{first_month:02d}-01",
            f"{y}-{last_month:02d}-{last_day:02d}",
        )
        if res is not None:
            evidence.s1 = res
    if req.label and wet and not evidence.news:
        progress("drilldown", "Local news check")
        known: set[str] = set()
        for n in drill.local_news(req.label):
            if n.url not in known:
                known.add(n.url)
                evidence.news.append(n)
