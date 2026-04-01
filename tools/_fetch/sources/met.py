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
