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
