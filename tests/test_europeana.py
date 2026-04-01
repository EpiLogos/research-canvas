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
