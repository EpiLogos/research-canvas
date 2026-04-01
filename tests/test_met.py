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
