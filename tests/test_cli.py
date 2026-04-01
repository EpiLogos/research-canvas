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
