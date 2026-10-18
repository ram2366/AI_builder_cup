import os

os.environ.setdefault("MOCK_DELAY_S", "0")
# Unit tests never call the real Gemini API; agent paths are tested with fakes.
os.environ["USE_AGENT"] = "false"
os.environ["EVIDENCE_PROVIDER"] = "mock"  # tests never touch live Earth Engine
