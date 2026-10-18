"""Gemini reads the satellite time series and reports visible change per year (structured)."""

from typing import Literal

from pydantic import BaseModel

from app.agent import llm, prompts
from app.schemas import VisionObs


class _Obs(BaseModel):
    year: int
    water_visible: bool
    construction_stage: Literal["none", "roads", "partial", "dense"]
    notes: list[str]


class _VisionOut(BaseModel):
    observations: list[_Obs]


def read_images(images: list[tuple[int, bytes]]) -> list[VisionObs]:
    """images: (year, png bytes), oldest first."""
    contents: list = []
    for year, data in images:
        contents += [f"Image for year {year}:", llm.image_part(data)]
    out = llm.generate_json(_VisionOut, contents, prompts.VISION)
    years = {y for y, _ in images}
    return [
        VisionObs(year=o.year, water_visible=o.water_visible,
                  construction_stage=o.construction_stage, notes=o.notes[:2])
        for o in sorted(out.observations, key=lambda o: o.year)
        if o.year in years
    ]
