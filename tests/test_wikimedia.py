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
