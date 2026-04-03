# fetch-image-assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Python script that downloads public-domain art/photos from Wikimedia, Met, and Europeana given a YAML config, plus a Claude skill that reads source docs and drives the script.

**Architecture:** The script is a standalone CLI tool (`tools/fetch-image-assets.py`) split into focused modules under `tools/_fetch/`. The skill (`~/.claude/skills/fetch-image-assets/SKILL.md`) is a pure markdown prompt — no code — that tells Claude how to read source material, generate `assets.yaml`, and invoke the script. Tests use `pytest`, `pytest-asyncio`, and `respx` to mock HTTP without hitting real APIs.

**Tech Stack:** Python 3.11+, httpx (async HTTP), pyyaml, respx (HTTP mocking), pytest, pytest-asyncio

---

## File Map

```
tools/
  fetch-image-assets.py         # CLI entry point — thin, delegates to _fetch/
  requirements.txt              # httpx, pyyaml
  requirements-dev.txt          # respx, pytest, pytest-asyncio
  _fetch/
    __init__.py                 # empty
    config.py                   # YAML parsing → Config / AssetEntry dataclasses
    sources/
      __init__.py               # empty
      wikimedia.py              # WikimediaFetcher
      met.py                    # MetFetcher
      europeana.py              # EuropeanaFetcher
      base.py                   # ImageResult dataclass shared by all sources
    downloader.py               # download bytes, hash dedup, safe_filename
    manifest.py                 # load/save manifest.json

tests/
  conftest.py                   # shared fixtures (tmp_path config, mock client)
  test_config.py
  test_wikimedia.py
  test_met.py
  test_europeana.py
  test_downloader.py
  test_manifest.py
  test_cli.py                   # end-to-end smoke with mocked HTTP

~/.claude/skills/fetch-image-assets/
  SKILL.md
```

---

### Task 1: Project scaffold + dependencies

**Files:**
- Create: `tools/requirements.txt`
- Create: `tools/requirements-dev.txt`
- Create: `tools/_fetch/__init__.py`
- Create: `tools/_fetch/sources/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Create requirements files**

`tools/requirements.txt`:
```
httpx>=0.27
pyyaml>=6.0
```

`tools/requirements-dev.txt`:
```
-r requirements.txt
pytest>=8
pytest-asyncio>=0.23
respx>=0.21
```

- [ ] **Step 2: Create empty `__init__.py` files**

```bash
mkdir -p tools/_fetch/sources tests
touch tools/_fetch/__init__.py tools/_fetch/sources/__init__.py
```

- [ ] **Step 3: Install dev dependencies**

```bash
cd tools && pip install -r requirements-dev.txt
```

Expected: no errors, packages installed.

- [ ] **Step 4: Create `tests/conftest.py`**

```python
# tests/conftest.py
import pytest
from pathlib import Path
import yaml


@pytest.fixture
def assets_dir(tmp_path):
    """Empty temp directory to use as output."""
    d = tmp_path / "assets"
    d.mkdir()
    return d


@pytest.fixture
def config_file(tmp_path):
    """Write a minimal assets.yaml and return its path."""
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
```

- [ ] **Step 5: Commit**

```bash
git add tools/ tests/conftest.py
git commit -m "feat: scaffold fetch-image-assets tool"
```

---

### Task 2: Config parsing

**Files:**
- Create: `tools/_fetch/config.py`
- Create: `tests/test_config.py`

- [ ] **Step 1: Write failing test**

`tests/test_config.py`:
```python
import pytest
import yaml
from pathlib import Path
from _fetch.config import load_config, Config, AssetEntry


def test_load_config_basic(config_file, tmp_path):
    cfg = load_config(config_file)
    assert isinstance(cfg, Config)
    assert cfg.target_per_category == 5
    assert cfg.output_dir == tmp_path / "assets"


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


def test_missing_categories_ok(tmp_path):
    data = {"target_per_category": 3, "symbols": {"wolf": {"queries": ["wolf medieval"]}}}
    p = tmp_path / "min.yaml"
    p.write_text(yaml.dump(data))
    cfg = load_config(p)
    assert len(cfg.entries) == 1
    assert cfg.entries[0].key == "wolf"
    assert cfg.entries[0].limit == 3  # falls back to target_per_category
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd tools && python -m pytest ../tests/test_config.py -v
```

Expected: `ModuleNotFoundError: No module named '_fetch.config'`

- [ ] **Step 3: Implement `tools/_fetch/config.py`**

```python
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
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd tools && python -m pytest ../tests/test_config.py -v
```

Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add tools/_fetch/config.py tests/test_config.py
git commit -m "feat: config parsing for fetch-image-assets"
```

---

### Task 3: Shared ImageResult type

**Files:**
- Create: `tools/_fetch/sources/base.py`

- [ ] **Step 1: Write `base.py`**

No test needed — it's a plain dataclass with no logic.

```python
# tools/_fetch/sources/base.py
from dataclasses import dataclass


@dataclass
class ImageResult:
    title: str
    artist: str
    date: str
    source: str          # "wikimedia" | "met" | "europeana"
    license: str
    source_url: str
    download_url: str
```

- [ ] **Step 2: Commit**

```bash
git add tools/_fetch/sources/base.py
git commit -m "feat: ImageResult dataclass"
```

---

### Task 4: Wikimedia Commons fetcher

**Files:**
- Create: `tools/_fetch/sources/wikimedia.py`
- Create: `tests/test_wikimedia.py`

- [ ] **Step 1: Write failing test**

`tests/test_wikimedia.py`:
```python
import pytest
import httpx
import respx
from _fetch.sources.wikimedia import fetch_wikimedia
from _fetch.sources.base import ImageResult

WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php"

MOCK_RESPONSE = {
    "query": {
        "pages": {
            "1": {
                "title": "File:Eagle mosaic.jpg",
                "imageinfo": [{
                    "url": "https://upload.wikimedia.org/eagle.jpg",
                    "thumburl": "https://upload.wikimedia.org/eagle_thumb.jpg",
                    "descriptionurl": "https://commons.wikimedia.org/wiki/File:Eagle_mosaic.jpg",
                    "extmetadata": {
                        "ObjectName": {"value": "Eagle Mosaic Ravenna"},
                        "Artist": {"value": "Unknown Byzantine"},
                        "DateTimeOriginal": {"value": "5th century"},
                        "LicenseShortName": {"value": "Public Domain"},
                    }
                }]
            }
        }
    }
}


@pytest.mark.asyncio
@respx.mock
async def test_fetch_wikimedia_returns_results():
    respx.get(WIKIMEDIA_API).mock(return_value=httpx.Response(200, json=MOCK_RESPONSE))
    async with httpx.AsyncClient() as client:
        results = await fetch_wikimedia("eagle Byzantine mosaic", limit=5, client=client)
    assert len(results) == 1
    r = results[0]
    assert isinstance(r, ImageResult)
    assert r.title == "Eagle Mosaic Ravenna"
    assert r.artist == "Unknown Byzantine"
    assert r.source == "wikimedia"
    assert r.license == "Public Domain"
    assert r.download_url == "https://upload.wikimedia.org/eagle.jpg"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_wikimedia_skips_missing_url():
    bad = {"query": {"pages": {"1": {"title": "File:X.jpg", "imageinfo": [{}]}}}}
    respx.get(WIKIMEDIA_API).mock(return_value=httpx.Response(200, json=bad))
    async with httpx.AsyncClient() as client:
        results = await fetch_wikimedia("test", limit=5, client=client)
    assert results == []


@pytest.mark.asyncio
@respx.mock
async def test_fetch_wikimedia_handles_empty_response():
    respx.get(WIKIMEDIA_API).mock(return_value=httpx.Response(200, json={}))
    async with httpx.AsyncClient() as client:
        results = await fetch_wikimedia("test", limit=5, client=client)
    assert results == []
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd tools && python -m pytest ../tests/test_wikimedia.py -v
```

Expected: `ModuleNotFoundError: No module named '_fetch.sources.wikimedia'`

- [ ] **Step 3: Implement `tools/_fetch/sources/wikimedia.py`**

```python
import httpx
from .base import ImageResult

WIKIMEDIA_API = "https://commons.wikimedia.org/w/api.php"


async def fetch_wikimedia(query: str, limit: int, client: httpx.AsyncClient) -> list[ImageResult]:
    try:
        resp = await client.get(WIKIMEDIA_API, params={
            "action": "query",
            "generator": "search",
            "gsrsearch": f"filetype:bitmap {query}",
            "gsrnamespace": 6,
            "gsrlimit": limit,
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": 1200,
            "format": "json",
        })
        data = resp.json()
    except Exception:
        return []

    pages = (data.get("query") or {}).get("pages", {}).values()
    results: list[ImageResult] = []

    for page in pages:
        ii = (page.get("imageinfo") or [{}])[0]
        url = ii.get("url") or ii.get("thumburl")
        if not url:
            continue
        meta = ii.get("extmetadata") or {}
        results.append(ImageResult(
            title=_val(meta, "ObjectName") or page.get("title", ""),
            artist=_val(meta, "Artist") or "Unknown",
            date=_val(meta, "DateTimeOriginal") or "",
            source="wikimedia",
            license=_val(meta, "LicenseShortName") or "Unknown",
            source_url=ii.get("descriptionurl", ""),
            download_url=url,
        ))

    return results


def _val(meta: dict, key: str) -> str:
    return (meta.get(key) or {}).get("value", "")
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd tools && python -m pytest ../tests/test_wikimedia.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add tools/_fetch/sources/wikimedia.py tests/test_wikimedia.py
git commit -m "feat: Wikimedia Commons fetcher"
```

---

### Task 5: Met Open Access fetcher

**Files:**
- Create: `tools/_fetch/sources/met.py`
- Create: `tests/test_met.py`

- [ ] **Step 1: Write failing test**

`tests/test_met.py`:
```python
import pytest
import httpx
import respx
from _fetch.sources.met import fetch_met
from _fetch.sources.base import ImageResult

MET_SEARCH = "https://collectionapi.metmuseum.org/public/collection/v1/search"
MET_OBJ = "https://collectionapi.metmuseum.org/public/collection/v1/objects/1234"

MOCK_OBJ = {
    "title": "Eagle of St John",
    "artistDisplayName": "Unknown Flemish",
    "objectDate": "c. 1500",
    "isPublicDomain": True,
    "primaryImageSmall": "https://images.metmuseum.org/eagle_small.jpg",
    "primaryImage": "https://images.metmuseum.org/eagle.jpg",
    "objectURL": "https://www.metmuseum.org/art/collection/search/1234",
}


@pytest.mark.asyncio
@respx.mock
async def test_fetch_met_returns_results():
    respx.get(MET_SEARCH).mock(return_value=httpx.Response(200, json={"objectIDs": [1234]}))
    respx.get(MET_OBJ).mock(return_value=httpx.Response(200, json=MOCK_OBJ))

    async with httpx.AsyncClient() as client:
        results = await fetch_met("eagle medieval", limit=5, client=client)

    assert len(results) == 1
    r = results[0]
    assert isinstance(r, ImageResult)
    assert r.title == "Eagle of St John"
    assert r.artist == "Unknown Flemish"
    assert r.source == "met"
    assert r.license == "Public Domain"
    assert r.download_url == "https://images.metmuseum.org/eagle_small.jpg"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_met_skips_no_image():
    no_img = {**MOCK_OBJ, "primaryImageSmall": "", "primaryImage": ""}
    respx.get(MET_SEARCH).mock(return_value=httpx.Response(200, json={"objectIDs": [1234]}))
    respx.get(MET_OBJ).mock(return_value=httpx.Response(200, json=no_img))

    async with httpx.AsyncClient() as client:
        results = await fetch_met("eagle medieval", limit=5, client=client)

    assert results == []


@pytest.mark.asyncio
@respx.mock
async def test_fetch_met_handles_no_ids():
    respx.get(MET_SEARCH).mock(return_value=httpx.Response(200, json={"objectIDs": None}))

    async with httpx.AsyncClient() as client:
        results = await fetch_met("nothing found", limit=5, client=client)

    assert results == []
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd tools && python -m pytest ../tests/test_met.py -v
```

Expected: `ModuleNotFoundError: No module named '_fetch.sources.met'`

- [ ] **Step 3: Implement `tools/_fetch/sources/met.py`**

```python
import httpx
from .base import ImageResult

MET_SEARCH = "https://collectionapi.metmuseum.org/public/collection/v1/search"
MET_OBJ_BASE = "https://collectionapi.metmuseum.org/public/collection/v1/objects"


async def fetch_met(query: str, limit: int, client: httpx.AsyncClient) -> list[ImageResult]:
    try:
        resp = await client.get(MET_SEARCH, params={
            "q": query,
            "hasImages": "true",
            "isPublicDomain": "true",
        })
        ids = resp.json().get("objectIDs") or []
    except Exception:
        return []

    results: list[ImageResult] = []
    for obj_id in ids[: limit * 2]:
        if len(results) >= limit:
            break
        try:
            obj_resp = await client.get(f"{MET_OBJ_BASE}/{obj_id}")
            obj = obj_resp.json()
        except Exception:
            continue
        img = obj.get("primaryImageSmall") or obj.get("primaryImage")
        if not img:
            continue
        results.append(ImageResult(
            title=obj.get("title", ""),
            artist=obj.get("artistDisplayName", "Unknown"),
            date=obj.get("objectDate", ""),
            source="met",
            license="Public Domain",
            source_url=obj.get("objectURL", ""),
            download_url=img,
        ))

    return results
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd tools && python -m pytest ../tests/test_met.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add tools/_fetch/sources/met.py tests/test_met.py
git commit -m "feat: Met Open Access fetcher"
```

---

### Task 6: Europeana fetcher

**Files:**
- Create: `tools/_fetch/sources/europeana.py`
- Create: `tests/test_europeana.py`

- [ ] **Step 1: Write failing test**

`tests/test_europeana.py`:
```python
import pytest
import httpx
import respx
from _fetch.sources.europeana import fetch_europeana
from _fetch.sources.base import ImageResult

EUROPEANA_URL = "https://api.europeana.eu/record/v2/search.json"

MOCK_ITEM = {
    "title": ["Eagle icon Byzantine"],
    "dcCreator": ["Unknown"],
    "year": ["800"],
    "rights": ["http://creativecommons.org/publicdomain/mark/1.0/"],
    "edmIsShownBy": ["https://europeana.eu/thumbnail/eagle.jpg"],
    "guid": "https://www.europeana.eu/en/item/123",
}


@pytest.mark.asyncio
@respx.mock
async def test_fetch_europeana_returns_results():
    respx.get(EUROPEANA_URL).mock(return_value=httpx.Response(200, json={"items": [MOCK_ITEM]}))

    async with httpx.AsyncClient() as client:
        results = await fetch_europeana("eagle Byzantine", limit=5, client=client, api_key="testkey")

    assert len(results) == 1
    r = results[0]
    assert isinstance(r, ImageResult)
    assert r.title == "Eagle icon Byzantine"
    assert r.source == "europeana"
    assert r.download_url == "https://europeana.eu/thumbnail/eagle.jpg"


@pytest.mark.asyncio
@respx.mock
async def test_fetch_europeana_skips_no_url():
    bad = {**MOCK_ITEM, "edmIsShownBy": [], "edmObject": []}
    respx.get(EUROPEANA_URL).mock(return_value=httpx.Response(200, json={"items": [bad]}))

    async with httpx.AsyncClient() as client:
        results = await fetch_europeana("test", limit=5, client=client, api_key="testkey")

    assert results == []


@pytest.mark.asyncio
@respx.mock
async def test_fetch_europeana_handles_empty():
    respx.get(EUROPEANA_URL).mock(return_value=httpx.Response(200, json={}))

    async with httpx.AsyncClient() as client:
        results = await fetch_europeana("test", limit=5, client=client, api_key="testkey")

    assert results == []
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd tools && python -m pytest ../tests/test_europeana.py -v
```

Expected: `ModuleNotFoundError: No module named '_fetch.sources.europeana'`

- [ ] **Step 3: Implement `tools/_fetch/sources/europeana.py`**

```python
import httpx
from .base import ImageResult

EUROPEANA_URL = "https://api.europeana.eu/record/v2/search.json"


async def fetch_europeana(
    query: str, limit: int, client: httpx.AsyncClient, api_key: str
) -> list[ImageResult]:
    try:
        resp = await client.get(EUROPEANA_URL, params={
            "query": query,
            "qf": "TYPE:IMAGE",
            "reusability": "open",
            "rows": limit,
            "profile": "rich",
            "wskey": api_key,
        })
        items = resp.json().get("items") or []
    except Exception:
        return []

    results: list[ImageResult] = []
    for item in items:
        url = _first(item.get("edmIsShownBy")) or _first(item.get("edmObject"))
        if not url:
            continue
        results.append(ImageResult(
            title=_first(item.get("title")) or "",
            artist=_first(item.get("dcCreator")) or "Unknown",
            date=str(_first(item.get("year")) or ""),
            source="europeana",
            license=_first(item.get("rights")) or "Unknown",
            source_url=item.get("guid", ""),
            download_url=url,
        ))
    return results


def _first(lst) -> str | None:
    if lst and len(lst) > 0:
        return str(lst[0])
    return None
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd tools && python -m pytest ../tests/test_europeana.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add tools/_fetch/sources/europeana.py tests/test_europeana.py
git commit -m "feat: Europeana fetcher"
```

---

### Task 7: Downloader + dedup

**Files:**
- Create: `tools/_fetch/downloader.py`
- Create: `tests/test_downloader.py`

- [ ] **Step 1: Write failing test**

`tests/test_downloader.py`:
```python
import pytest
import httpx
import respx
from pathlib import Path
from _fetch.downloader import download_image, content_hash, safe_filename


@pytest.mark.asyncio
@respx.mock
async def test_download_image_saves_file(tmp_path):
    img_bytes = b"\xff\xd8\xff" + b"x" * 100  # fake JPEG header
    respx.get("https://example.com/img.jpg").mock(
        return_value=httpx.Response(200, content=img_bytes, headers={"content-type": "image/jpeg"})
    )
    dest = tmp_path / "out.jpg"
    async with httpx.AsyncClient() as client:
        ok = await download_image("https://example.com/img.jpg", dest, client)
    assert ok is True
    assert dest.exists()
    assert dest.read_bytes() == img_bytes


@pytest.mark.asyncio
@respx.mock
async def test_download_image_rejects_non_image(tmp_path):
    respx.get("https://example.com/page.html").mock(
        return_value=httpx.Response(200, content=b"<html>", headers={"content-type": "text/html"})
    )
    dest = tmp_path / "bad.jpg"
    async with httpx.AsyncClient() as client:
        ok = await download_image("https://example.com/page.html", dest, client)
    assert ok is False
    assert not dest.exists()


@pytest.mark.asyncio
@respx.mock
async def test_download_image_rejects_404(tmp_path):
    respx.get("https://example.com/missing.jpg").mock(return_value=httpx.Response(404))
    dest = tmp_path / "missing.jpg"
    async with httpx.AsyncClient() as client:
        ok = await download_image("https://example.com/missing.jpg", dest, client)
    assert ok is False


def test_content_hash_consistent():
    data = b"hello world"
    assert content_hash(data) == content_hash(data)
    assert content_hash(data) != content_hash(b"other")
    assert len(content_hash(data)) == 16


def test_safe_filename_basic():
    name = safe_filename("https://example.com/file.jpg", "Eagle of Rome", 0)
    assert name.endswith(".jpg")
    assert "eagle" in name.lower()
    assert "000" in name


def test_safe_filename_strips_query_string():
    name = safe_filename("https://cdn.example.com/img.png?w=800&h=600", "Test", 1)
    assert name.endswith(".png")
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd tools && python -m pytest ../tests/test_downloader.py -v
```

Expected: `ModuleNotFoundError: No module named '_fetch.downloader'`

- [ ] **Step 3: Implement `tools/_fetch/downloader.py`**

```python
import hashlib
from pathlib import Path
import httpx


async def download_image(url: str, dest: Path, client: httpx.AsyncClient) -> bool:
    try:
        resp = await client.get(url, follow_redirects=True, timeout=30)
        if resp.status_code != 200:
            return False
        if "image" not in resp.headers.get("content-type", ""):
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)
        return True
    except Exception:
        return False


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def safe_filename(url: str, title: str, index: int) -> str:
    # strip query string before extracting extension
    clean_url = url.split("?")[0]
    ext = Path(clean_url).suffix or ".jpg"
    slug = "".join(c if c.isalnum() or c == "-" else "-" for c in title.lower())
    slug = slug[:40].strip("-")
    return f"{slug}-{index:03d}{ext}"
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd tools && python -m pytest ../tests/test_downloader.py -v
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add tools/_fetch/downloader.py tests/test_downloader.py
git commit -m "feat: image downloader with hash dedup"
```

---

### Task 8: Manifest read/write

**Files:**
- Create: `tools/_fetch/manifest.py`
- Create: `tests/test_manifest.py`

- [ ] **Step 1: Write failing test**

`tests/test_manifest.py`:
```python
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
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd tools && python -m pytest ../tests/test_manifest.py -v
```

Expected: `ModuleNotFoundError: No module named '_fetch.manifest'`

- [ ] **Step 3: Implement `tools/_fetch/manifest.py`**

```python
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
```

- [ ] **Step 4: Run test — verify PASS**

```bash
cd tools && python -m pytest ../tests/test_manifest.py -v
```

Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add tools/_fetch/manifest.py tests/test_manifest.py
git commit -m "feat: manifest read/write with dedup merge"
```

---

### Task 9: Orchestrator + CLI entry point

**Files:**
- Create: `tools/fetch-image-assets.py`
- Create: `tests/test_cli.py`

- [ ] **Step 1: Write failing test**

`tests/test_cli.py`:
```python
import pytest
import httpx
import respx
import yaml
import json
from pathlib import Path
import sys

# Add tools/ to path so we can import the script's internals
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

from _fetch.config import load_config
from _fetch.sources.base import ImageResult

# We'll test the orchestrate() function directly
# Import after path is set
import importlib
import types


FAKE_IMG = b"\xff\xd8\xff" + b"x" * 50  # minimal fake JPEG


@pytest.mark.asyncio
@respx.mock
async def test_full_pipeline_smoke(tmp_path):
    """End-to-end: config → fetch (mocked) → files on disk → manifest written."""
    # Write a config
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

    # Mock Wikimedia to return one result
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
    # Mock Met to return empty
    respx.get("https://collectionapi.metmuseum.org/public/collection/v1/search").mock(
        return_value=httpx.Response(200, json={"objectIDs": None})
    )
    # Mock image download
    respx.get("https://upload.wikimedia.org/eagle.jpg").mock(
        return_value=httpx.Response(200, content=FAKE_IMG, headers={"content-type": "image/jpeg"})
    )

    # Run orchestrator
    from _fetch.orchestrator import orchestrate
    await orchestrate(config_path, output_dir_override=out_dir, europeana_key="")

    # Check files exist
    manifest_path = out_dir / "manifest.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text())
    assert len(manifest) >= 1
    assert manifest[0]["source"] == "wikimedia"

    img_path = out_dir / manifest[0]["local_path"]
    assert img_path.exists()
```

- [ ] **Step 2: Run test — verify FAIL**

```bash
cd tools && python -m pytest ../tests/test_cli.py -v
```

Expected: `ModuleNotFoundError: No module named '_fetch.orchestrator'`

- [ ] **Step 3: Implement `tools/_fetch/orchestrator.py`**

```python
import asyncio
from pathlib import Path
from typing import Optional
import httpx

from .config import load_config, AssetEntry, Config
from .sources.base import ImageResult
from .sources.wikimedia import fetch_wikimedia
from .sources.met import fetch_met
from .sources.europeana import fetch_europeana
from .downloader import download_image, content_hash, safe_filename
from .manifest import load_manifest, save_manifest, merge_entries


async def _process_entry(
    entry: AssetEntry,
    config: Config,
    client: httpx.AsyncClient,
    europeana_key: str,
) -> list[dict]:
    out_dir = config.output_dir / entry.category / entry.key
    out_dir.mkdir(parents=True, exist_ok=True)

    seen_hashes: set[str] = set()
    collected: list[dict] = []
    per_source = max(1, entry.limit // 3)

    for query in entry.queries:
        if len(collected) >= entry.limit:
            break

        fetch_tasks = [
            fetch_wikimedia(query, per_source, client),
            fetch_met(query, per_source, client),
        ]
        if europeana_key:
            fetch_tasks.append(fetch_europeana(query, per_source, client, europeana_key))

        gathered = await asyncio.gather(*fetch_tasks, return_exceptions=True)
        results: list[ImageResult] = []
        for r in gathered:
            if isinstance(r, list):
                results.extend(r)

        for result in results:
            if len(collected) >= entry.limit:
                break
            filename = safe_filename(result.download_url, result.title, len(collected))
            dest = out_dir / filename

            try:
                resp = await client.get(result.download_url, follow_redirects=True, timeout=30)
                if resp.status_code != 200 or "image" not in resp.headers.get("content-type", ""):
                    continue
                h = content_hash(resp.content)
                if h in seen_hashes:
                    continue
                seen_hashes.add(h)
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(resp.content)
                local_path = str(dest.relative_to(config.output_dir))
                collected.append({
                    "category": entry.category,
                    "key": entry.key,
                    "label": entry.label,
                    "local_path": local_path,
                    "title": result.title,
                    "artist": result.artist,
                    "date": result.date,
                    "source": result.source,
                    "license": result.license,
                    "source_url": result.source_url,
                    "download_url": result.download_url,
                })
            except Exception:
                continue

    return collected


async def orchestrate(
    config_path: Path,
    output_dir_override: Optional[Path],
    europeana_key: str,
) -> None:
    config = load_config(config_path, output_dir_override)
    config.output_dir.mkdir(parents=True, exist_ok=True)

    manifest_path = config.output_dir / "manifest.json"
    manifest = load_manifest(manifest_path)

    limits = httpx.Limits(max_connections=10, max_keepalive_connections=5)
    async with httpx.AsyncClient(limits=limits, timeout=60) as client:
        for entry in config.entries:
            print(f"  [{entry.category}/{entry.key}] fetching up to {entry.limit} images...")
            new_entries = await _process_entry(entry, config, client, europeana_key)
            merged = merge_entries(manifest, new_entries)
            added = len(merged) - len(manifest)
            manifest = merged
            print(f"    → {added} new images")

    save_manifest(manifest_path, manifest)
    print(f"\nDone. {len(manifest)} total images in manifest.")
```

- [ ] **Step 4: Implement `tools/fetch-image-assets.py`**

```python
#!/usr/bin/env python3
"""fetch-image-assets — download public-domain imagery from Wikimedia, Met, and Europeana.

Usage:
    python fetch-image-assets.py <config.yaml> [output-dir]
"""
import asyncio
import sys
from pathlib import Path

# Allow running from any directory
sys.path.insert(0, str(Path(__file__).parent))

from _fetch.orchestrator import orchestrate


def main():
    if len(sys.argv) < 2:
        print("Usage: fetch-image-assets.py <config.yaml> [output-dir]", file=sys.stderr)
        sys.exit(1)

    config_path = Path(sys.argv[1])
    if not config_path.exists():
        print(f"Error: config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else None

    europeana_key_path = Path.home() / ".secrets" / "europeana-api-key.txt"
    europeana_key = europeana_key_path.read_text().strip() if europeana_key_path.exists() else ""
    if not europeana_key:
        print("  [info] No Europeana API key found at ~/.secrets/europeana-api-key.txt — skipping Europeana")

    asyncio.run(orchestrate(config_path, output_dir, europeana_key))


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run all tests — verify PASS**

```bash
cd tools && python -m pytest ../tests/ -v
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add tools/fetch-image-assets.py tools/_fetch/orchestrator.py tests/test_cli.py
git commit -m "feat: orchestrator and CLI entry point"
```

---

### Task 10: Write the Claude skill

**Files:**
- Create: `~/.claude/skills/fetch-image-assets/SKILL.md`

- [ ] **Step 1: Create skill directory**

```bash
mkdir -p ~/.claude/skills/fetch-image-assets
```

- [ ] **Step 2: Write `SKILL.md`**

`~/.claude/skills/fetch-image-assets/SKILL.md`:
```markdown
---
name: fetch-image-assets
description: Fetch public-domain art, historical photos, book covers, portraits, and symbolic imagery from Wikimedia Commons, Met Open Access, and Europeana. Reads any source document to extract asset targets, generates assets.yaml with rich search queries, then runs the download script. USE WHEN the user wants to gather visual research assets for any document or topic.
---

# SKILL: fetch-image-assets

Read source material → write `assets.yaml` → run `tools/fetch-image-assets.py`.

## Invocation

```
/fetch-image-assets <source-doc-path> [--config path/to/assets.yaml] [--output path/to/assets/]
```

Examples:
```
/fetch-image-assets episodes/ep-0.2/Episode_0_2_The_Fire_of_the_Gods_v4.md
/fetch-image-assets episodes/ep-0.2/ --output episodes/ep-0.2/assets
/fetch-image-assets "Medici banking, MK-ULTRA, eagle heraldry" --output research/assets
```

## Step 1 — Read the source

Read every file in the provided path, or interpret a freeform description directly. Extract all visual asset targets across five categories:

| Category | What to look for |
|----------|-----------------|
| `symbols` | Archetypes, animals, geometric forms, iconographic motifs |
| `figures` | Named historical persons, implied historical actors |
| `books` | Texts, manuscripts, published works cited or referenced |
| `artworks` | Specific named paintings, sculptures, engravings, frescoes |
| `photos` | Historical events, programs, institutions with documentary photo records |

## Step 2 — Write assets.yaml

Write or update `assets.yaml`. Default location: next to the source doc. Use `--config` to override.

**Format:**
```yaml
target_per_category: 12

symbols:
  eagle:
    queries:
      - "eagle Roman empire mosaic Byzantine gold"
      - "eagle solar heraldry medieval illuminated manuscript"
      - "eagle engraving 18th century allegorical print"
    limit: 15          # optional, overrides target_per_category

figures:
  cosimo_de_medici:
    label: "Cosimo de' Medici"
    queries:
      - "Cosimo de Medici portrait painting Renaissance Florence"
      - "Pontormo Bronzino Medici portrait 15th century"
      - "Medici family dynasty fresco painting"

books:
  the_prince_machiavelli:
    label: "The Prince — Machiavelli"
    queries:
      - "Il Principe Machiavelli title page woodcut early edition 1532"
      - "Machiavelli portrait Renaissance engraving"
      - "The Prince Machiavelli 16th century illuminated manuscript"

artworks:
  goya_saturn:
    label: "Saturn Devouring His Son — Goya"
    queries:
      - "Goya Saturn devouring his son painting Prado"
      - "Francisco Goya Black Paintings dark fresco"
      - "Saturn Kronos devouring child mythology Baroque painting"

photos:
  mkultra:
    label: "MK-ULTRA"
    queries:
      - "CIA MK-ULTRA declassified document photograph 1950s"
      - "Cold War psychological experiment archival photograph"
      - "CIA mind control program documentary photograph"
```

**Query writing rules — never just use the noun:**
- **Symbols:** vary medium (mosaic, fresco, engraving, woodcut, illumination), period, and cultural sphere across queries
- **Figures:** full name + "portrait", specific known portrait artists, period context + location
- **Books:** title + "title page" + "early edition" + year; author portrait; manuscript/illustration variant
- **Artworks:** artist full name + title + medium; style/movement terms; museum name if known
- **Photos:** event name + "photograph" + decade; "archival", "declassified", "documentary" variants

Aim for 40–50 images per episode. Set `target_per_category: 12` and `limit: 15` for major symbols.

## Step 3 — Run the script

```bash
python tools/fetch-image-assets.py assets.yaml [output-dir]
```

Default output dir comes from the config. Override with `--output` or pass as second CLI arg.

## Step 4 — Report

Tell the user:
- How many symbols/figures/books/artworks/photos were extracted
- Total images downloaded, broken down by source (Wikimedia / Met / Europeana)
- Any categories with zero results (suggest query refinements)
- Path to manifest.json

## Setup (first time)

**Europeana API key** (free):
```bash
mkdir -p ~/.secrets
echo "YOUR_KEY" > ~/.secrets/europeana-api-key.txt
chmod 600 ~/.secrets/europeana-api-key.txt
```
Get key at: https://apis.europeana.eu/en

**Script dependencies:**
```bash
pip install httpx pyyaml
```
```

- [ ] **Step 3: Verify skill is discoverable**

```bash
ls ~/.claude/skills/fetch-image-assets/
```

Expected: `SKILL.md`

- [ ] **Step 4: Commit**

```bash
git add "tools/fetch-image-assets.py" "tools/_fetch/" "tests/"
git commit -m "feat: fetch-image-assets Claude skill"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Five asset categories (symbols, figures, books, artworks, photos)
- ✅ Three sources (Wikimedia, Met, Europeana)
- ✅ Per-symbol subdirectories under output dir
- ✅ manifest.json with full metadata per image
- ✅ Hash-based dedup
- ✅ Europeana key from `~/.secrets/`
- ✅ CLI: `python tools/fetch-image-assets.py <config> [output-dir]`
- ✅ Skill reads source docs and generates rich queries
- ✅ Skill invokes script after writing YAML
- ✅ Rate-limit/retry: httpx limits + per-source exception handling (silent skip)

**Placeholder scan:** None found.

**Type consistency:** `ImageResult` defined in `base.py`, imported consistently across all fetchers and orchestrator. `AssetEntry` and `Config` defined in `config.py`, used in orchestrator and tests via fixture.
