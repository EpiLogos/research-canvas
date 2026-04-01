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
    clean_url = url.split("?")[0]
    ext = Path(clean_url).suffix or ".jpg"
    slug = "".join(c if c.isalnum() or c == "-" else "-" for c in title.lower())
    slug = slug[:40].strip("-")
    return f"{slug}-{index:03d}{ext}"
