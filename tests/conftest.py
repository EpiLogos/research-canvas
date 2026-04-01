# tests/conftest.py
import pytest
from pathlib import Path
import yaml


@pytest.fixture
def assets_dir(tmp_path):
    d = tmp_path / "assets"
    d.mkdir()
    return d


@pytest.fixture
def config_file(tmp_path):
    data = {
        "target_per_category": 5,
        "output_dir": str(tmp_path / "assets"),
        "symbols": {
            "eagle": {
                "queries": ["eagle Byzantine mosaic", "eagle Roman heraldry"],
                "limit": 4,
            }
        },
        "figures": {
            "cosimo_de_medici": {
                "label": "Cosimo de' Medici",
                "queries": ["Cosimo de Medici portrait Renaissance"],
            }
        },
        "books": {},
        "artworks": {},
        "photos": {},
    }
    p = tmp_path / "assets.yaml"
    p.write_text(yaml.dump(data))
    return p
