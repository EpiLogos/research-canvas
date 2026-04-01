import json
from pathlib import Path
from _fetch.manifest import load_manifest, save_manifest, merge_entries


def test_load_manifest_empty_when_missing(tmp_path):
    result = load_manifest(tmp_path / "manifest.json")
    assert result == []


def test_save_and_load_roundtrip(tmp_path):
    path = tmp_path / "manifest.json"
    entries = [{"category": "symbols", "key": "eagle", "title": "Eagle mosaic"}]
    save_manifest(path, entries)
    loaded = load_manifest(path)
    assert loaded == entries


def test_merge_entries_deduplicates_by_local_path(tmp_path):
    existing = [{"local_path": "symbols/eagle/img-000.jpg", "title": "Old"}]
    new = [
        {"local_path": "symbols/eagle/img-000.jpg", "title": "Duplicate"},
        {"local_path": "symbols/eagle/img-001.jpg", "title": "New"},
    ]
    merged = merge_entries(existing, new)
    assert len(merged) == 2
    titles = [e["title"] for e in merged]
    assert "Old" in titles
    assert "New" in titles
    assert "Duplicate" not in titles


def test_merge_entries_handles_missing_local_path():
    existing = [{"title": "No path entry"}]
    new = [{"local_path": "symbols/eagle/img-001.jpg", "title": "New"}]
    merged = merge_entries(existing, new)
    assert len(merged) == 2


def test_load_manifest_handles_malformed_json(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text("not valid json {{{")
    result = load_manifest(path)
    assert result == []


def test_load_manifest_handles_non_list_json(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text('{"key": "value"}')
    result = load_manifest(path)
    assert result == []
