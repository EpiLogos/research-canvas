# tests/conftest.py
import pytest
import yaml


@pytest.fixture
def assets_dir(tmp_path):
    """Empty temp directory to use as output."""
    d = tmp_path / "assets"
    d.mkdir()
    return d


@pytest.fixture
def config_file(tmp_path, assets_dir):
    """Write a minimal assets.yaml and return its path. output_dir points to assets_dir."""
    data = {
        "target_per_category": 5,
        "output_dir": str(assets_dir),
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
