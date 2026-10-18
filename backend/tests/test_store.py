from app.schemas import Report
from app.services.store import FirestoreStore


class _Snapshot:
    def __init__(self, value: dict | None) -> None:
        self._value = value
        self.exists = value is not None

    def to_dict(self) -> dict | None:
        return self._value


class _Document:
    def __init__(self, data: dict[str, dict], key: str) -> None:
        self._data = data
        self._key = key

    def set(self, value: dict) -> None:
        self._data[self._key] = value

    def get(self) -> _Snapshot:
        return _Snapshot(self._data.get(self._key))


class _Collection:
    def __init__(self, data: dict[str, dict]) -> None:
        self._data = data

    def document(self, key: str) -> _Document:
        return _Document(self._data, key)


class _Client:
    def __init__(self) -> None:
        self.data: dict[str, dict] = {}

    def collection(self, _name: str) -> _Collection:
        return _Collection(self.data)


def test_firestore_store_round_trip_is_hermetic():
    client = _Client()
    store = FirestoreStore(client)  # type: ignore[arg-type]
    report = Report(
        id="stored-report",
        status="queued",
        location={"lat": 12.9, "lng": 77.6, "label": "Test plot"},
        radius_m=250,
        lang="en",
        created_at=1_700_000_000,
    )

    store.save(report)

    loaded = store.get(report.id)
    assert loaded is not None
    assert loaded.model_dump(mode="json") == report.model_dump(mode="json")
    assert store.get("missing") is None
