import pytest
import yaml
from pathlib import Path
from _fetch.config import load_config, Config, AssetEntry


def test_load_config_basic(config_file, assets_dir):
    cfg = load_config(config_file)
    assert isinstance(cfg, Config)
    assert cfg.target_per_category == 5
    assert cfg.output_dir == assets_dir


def test_load_config_entries(config_file):
    cfg = load_config(config_file)
    keys = [(e.category, e.key) for e in cfg.entries]
    assert ("symbols", "eagle") in keys
    assert ("figures", "cosimo_de_medici") in keys


def test_entry_fields(config_file):
    cfg = load_config(config_file)
    eagle = next(e for e in cfg.entries if e.key == "eagle")
    assert eagle.label == "eagle"
    assert eagle.limit == 4
    assert "eagle Byzantine mosaic" in eagle.queries


def test_output_dir_override(config_file, tmp_path):
    override = tmp_path / "custom_out"
    cfg = load_config(config_file, output_dir_override=override)
    assert cfg.output_dir == override


def test_missing_queries_raises(tmp_path):
    data = {"target_per_category": 3, "symbols": {"wolf": {}}}
    p = tmp_path / "bad.yaml"
    p.write_text(yaml.dump(data))
    with pytest.raises(ValueError, match="missing a non-empty 'queries'"):
        load_config(p)


def test_missing_categories_ok(tmp_path):
    data = {"target_per_category": 3, "symbols": {"wolf": {"queries": ["wolf medieval"]}}}
    p = tmp_path / "min.yaml"
    p.write_text(yaml.dump(data))
    cfg = load_config(p)
    assert len(cfg.entries) == 1
    assert cfg.entries[0].key == "wolf"
    assert cfg.entries[0].limit == 3  # falls back to target_per_category
