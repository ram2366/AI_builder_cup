"""Report storage. In-memory for local dev; Firestore for multi-instance Cloud Run."""

import threading
from functools import lru_cache
from typing import Protocol

from google.cloud import firestore

from app.config import get_settings
from app.schemas import Report


class ReportStore(Protocol):
    def save(self, report: Report) -> None: ...
    def get(self, report_id: str) -> Report | None: ...


class MemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, Report] = {}
        self._lock = threading.Lock()

    def save(self, report: Report) -> None:
        with self._lock:
            self._data[report.id] = report.model_copy(deep=True)

    def get(self, report_id: str) -> Report | None:
        with self._lock:
            r = self._data.get(report_id)
            return r.model_copy(deep=True) if r else None


@lru_cache
def get_firestore_client() -> firestore.Client:
    return firestore.Client(project=get_settings().gcp_project or None)


class FirestoreStore:
    def __init__(self, client: firestore.Client | None = None) -> None:
        self._reports = (client or get_firestore_client()).collection("reports")

    def save(self, report: Report) -> None:
        self._reports.document(report.id).set(report.model_dump(mode="json"))

    def get(self, report_id: str) -> Report | None:
        snapshot = self._reports.document(report_id).get()
        return Report.model_validate(snapshot.to_dict()) if snapshot.exists else None


_store: ReportStore | None = None


def get_store() -> ReportStore:
    global _store
    if _store is None:
        kind = get_settings().store
        if kind == "memory":
            _store = MemoryStore()
        elif kind == "firestore":
            _store = FirestoreStore()
        else:
            raise ValueError(f"Unknown store '{kind}'")
    return _store
