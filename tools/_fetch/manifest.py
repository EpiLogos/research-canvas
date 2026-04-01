import json
from pathlib import Path


def load_manifest(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, ValueError):
        return []


def save_manifest(path: Path, entries: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(entries, indent=2))


def merge_entries(existing: list[dict], new: list[dict]) -> list[dict]:
    existing_paths = {e.get("local_path") for e in existing if e.get("local_path")}
    deduped = [e for e in new if e.get("local_path") not in existing_paths]
    return existing + deduped
