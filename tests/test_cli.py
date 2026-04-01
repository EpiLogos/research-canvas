import pytest
import httpx
import respx
import yaml
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

from _fetch.orchestrator import orchestrate

FAKE_IMG = b"\xff\xd8\xff" + b"x" * 50


@pytest.mark.asyncio
@respx.mock
async def test_full_pipeline_smoke(tmp_path):
    """End-to-end: config -> fetch (mocked) -> files on disk -> manifest written."""
    data = {
        "target_per_category": 2,
        "symbols": {
            "eagle": {
                "queries": ["eagle Byzantine"],
                "limit": 1,
            }
        }
    }
    config_path = tmp_path / "assets.yaml"
    config_path.write_text(yaml.dump(data))
    out_dir = tmp_path / "assets"

    respx.get("https://commons.wikimedia.org/w/api.php").mock(return_value=httpx.Response(200, json={
        "query": {"pages": {"1": {
            "title": "File:Eagle.jpg",
            "imageinfo": [{
                "url": "https://upload.wikimedia.org/eagle.jpg",
                "descriptionurl": "https://commons.wikimedia.org/wiki/File:Eagle.jpg",
                "extmetadata": {
                    "ObjectName": {"value": "Eagle mosaic"},
                    "Artist": {"value": "Unknown"},
                    "DateTimeOriginal": {"value": "500 AD"},
                    "LicenseShortName": {"value": "Public Domain"},
                }
            }]
        }}}
    }))
    respx.get("https://collectionapi.metmuseum.org/public/collection/v1/search").mock(
        return_value=httpx.Response(200, json={"objectIDs": None})
    )
    respx.get("https://upload.wikimedia.org/eagle.jpg").mock(
        return_value=httpx.Response(200, content=FAKE_IMG, headers={"content-type": "image/jpeg"})
    )

    await orchestrate(config_path, output_dir_override=out_dir, europeana_key="")

    manifest_path = out_dir / "manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text())
    assert len(manifest) >= 1
    assert manifest[0]["source"] == "wikimedia"

    img_path = out_dir / manifest[0]["local_path"]
    assert img_path.exists()


@pytest.mark.asyncio
@respx.mock
async def test_dedup_same_bytes_not_written_twice(tmp_path):
    """Two Wikimedia results with identical bytes produce only one manifest entry."""
    data = {
        "target_per_category": 5,
        "symbols": {"eagle": {"queries": ["eagle"], "limit": 5}},
    }
    config_path = tmp_path / "assets.yaml"
    config_path.write_text(yaml.dump(data))
    out_dir = tmp_path / "assets"

    # Two pages with different titles but same download URL -> same bytes
    respx.get("https://commons.wikimedia.org/w/api.php").mock(return_value=httpx.Response(200, json={
        "query": {"pages": {
            "1": {
                "title": "File:Eagle1.jpg",
                "imageinfo": [{
                    "url": "https://upload.wikimedia.org/same.jpg",
                    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Eagle1.jpg",
                    "extmetadata": {
                        "ObjectName": {"value": "Eagle One"},
                        "Artist": {"value": "Unknown"},
                        "DateTimeOriginal": {"value": "500 AD"},
                        "LicenseShortName": {"value": "Public Domain"},
                    }
                }]
            },
            "2": {
                "title": "File:Eagle2.jpg",
                "imageinfo": [{
                    "url": "https://upload.wikimedia.org/same.jpg",
                    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Eagle2.jpg",
                    "extmetadata": {
                        "ObjectName": {"value": "Eagle Two"},
                        "Artist": {"value": "Unknown"},
                        "DateTimeOriginal": {"value": "500 AD"},
                        "LicenseShortName": {"value": "Public Domain"},
                    }
                }]
            },
        }}
    }))
    respx.get("https://collectionapi.metmuseum.org/public/collection/v1/search").mock(
        return_value=httpx.Response(200, json={"objectIDs": None})
    )
    respx.get("https://upload.wikimedia.org/same.jpg").mock(
        return_value=httpx.Response(200, content=FAKE_IMG, headers={"content-type": "image/jpeg"})
    )

    await orchestrate(config_path, output_dir_override=out_dir, europeana_key="")

    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert len(manifest) == 1, f"Expected 1 (dedup), got {len(manifest)}"


@pytest.mark.asyncio
@respx.mock
async def test_entry_limit_is_enforced(tmp_path):
    """Config limit=1 stops collection after first successful download even if more are available."""
    data = {
        "target_per_category": 5,
        "symbols": {"eagle": {"queries": ["eagle"], "limit": 1}},
    }
    config_path = tmp_path / "assets.yaml"
    config_path.write_text(yaml.dump(data))
    out_dir = tmp_path / "assets"

    respx.get("https://commons.wikimedia.org/w/api.php").mock(return_value=httpx.Response(200, json={
        "query": {"pages": {
            "1": {
                "title": "File:Eagle1.jpg",
                "imageinfo": [{
                    "url": "https://upload.wikimedia.org/eagle1.jpg",
                    "descriptionurl": "",
                    "extmetadata": {
                        "ObjectName": {"value": "Eagle One"},
                        "Artist": {"value": "A"},
                        "DateTimeOriginal": {"value": ""},
                        "LicenseShortName": {"value": "PD"},
                    }
                }]
            },
            "2": {
                "title": "File:Eagle2.jpg",
                "imageinfo": [{
                    "url": "https://upload.wikimedia.org/eagle2.jpg",
                    "descriptionurl": "",
                    "extmetadata": {
                        "ObjectName": {"value": "Eagle Two"},
                        "Artist": {"value": "B"},
                        "DateTimeOriginal": {"value": ""},
                        "LicenseShortName": {"value": "PD"},
                    }
                }]
            },
        }}
    }))
    respx.get("https://collectionapi.metmuseum.org/public/collection/v1/search").mock(
        return_value=httpx.Response(200, json={"objectIDs": None})
    )
    respx.get("https://upload.wikimedia.org/eagle1.jpg").mock(
        return_value=httpx.Response(200, content=FAKE_IMG, headers={"content-type": "image/jpeg"})
    )
    respx.get("https://upload.wikimedia.org/eagle2.jpg").mock(
        return_value=httpx.Response(200, content=FAKE_IMG + b"extra", headers={"content-type": "image/jpeg"})
    )

    await orchestrate(config_path, output_dir_override=out_dir, europeana_key="")

    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert len(manifest) == 1, f"Expected 1 (limit enforced), got {len(manifest)}"


@pytest.mark.asyncio
@respx.mock
async def test_partial_failure_continues(tmp_path):
    """A 404 on the first download URL does not abort; the second image is still fetched."""
    data = {
        "target_per_category": 5,
        "symbols": {"eagle": {"queries": ["eagle"], "limit": 5}},
    }
    config_path = tmp_path / "assets.yaml"
    config_path.write_text(yaml.dump(data))
    out_dir = tmp_path / "assets"

    respx.get("https://commons.wikimedia.org/w/api.php").mock(return_value=httpx.Response(200, json={
        "query": {"pages": {
            "1": {
                "title": "File:Bad.jpg",
                "imageinfo": [{
                    "url": "https://upload.wikimedia.org/bad.jpg",
                    "descriptionurl": "",
                    "extmetadata": {
                        "ObjectName": {"value": "Bad"},
                        "Artist": {"value": "X"},
                        "DateTimeOriginal": {"value": ""},
                        "LicenseShortName": {"value": "PD"},
                    }
                }]
            },
            "2": {
                "title": "File:Good.jpg",
                "imageinfo": [{
                    "url": "https://upload.wikimedia.org/good.jpg",
                    "descriptionurl": "",
                    "extmetadata": {
                        "ObjectName": {"value": "Good Eagle"},
                        "Artist": {"value": "Y"},
                        "DateTimeOriginal": {"value": "500 AD"},
                        "LicenseShortName": {"value": "Public Domain"},
                    }
                }]
            },
        }}
    }))
    respx.get("https://collectionapi.metmuseum.org/public/collection/v1/search").mock(
        return_value=httpx.Response(200, json={"objectIDs": None})
    )
    respx.get("https://upload.wikimedia.org/bad.jpg").mock(return_value=httpx.Response(404))
    respx.get("https://upload.wikimedia.org/good.jpg").mock(
        return_value=httpx.Response(200, content=FAKE_IMG, headers={"content-type": "image/jpeg"})
    )

    await orchestrate(config_path, output_dir_override=out_dir, europeana_key="")

    manifest = json.loads((out_dir / "manifest.json").read_text())
    assert len(manifest) == 1
    assert manifest[0]["title"] == "Good Eagle"
