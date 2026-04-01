import json
from pathlib import Path


def load_manifest(path: Path) -> list[dict]:
    if path.exists():
        return json.loads(path.read_text())
    return []


def save_manifest(path: Path, entries: list[dict]) -> None:
    path.write_text(json.dumps(entries, indent=2))


def merge_entries(existing: list[dict], new: list[dict]) -> list[dict]:
    existing_paths = {e["local_path"] for e in existing}
    deduped = [e for e in new if e["local_path"] not in existing_paths]
    return existing + deduped
