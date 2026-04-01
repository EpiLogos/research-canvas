from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import yaml


CATEGORIES = ["symbols", "figures", "books", "artworks", "photos"]


@dataclass
class AssetEntry:
    key: str
    category: str
    label: str
    queries: list[str]
    limit: int


@dataclass
class Config:
    output_dir: Path
    target_per_category: int
    entries: list[AssetEntry] = field(default_factory=list)


def load_config(config_path: Path, output_dir_override: Optional[Path] = None) -> Config:
    data = yaml.safe_load(config_path.read_text())
    target = int(data.get("target_per_category", 10))
    raw_out = data.get("output_dir", "assets")
    out = output_dir_override if output_dir_override is not None else Path(raw_out)

    entries: list[AssetEntry] = []
    for category in CATEGORIES:
        for key, val in (data.get(category) or {}).items():
            entries.append(AssetEntry(
                key=key,
                category=category,
                label=val.get("label", key),
                queries=list(val["queries"]),
                limit=int(val.get("limit", target)),
            ))

    return Config(output_dir=out, target_per_category=target, entries=entries)
