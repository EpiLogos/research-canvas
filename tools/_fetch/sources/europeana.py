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
