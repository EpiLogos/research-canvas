import asyncio
from pathlib import Path
from typing import Optional
import httpx

from .config import load_config, AssetEntry, Config
from .sources.base import ImageResult
from .sources.wikimedia import fetch_wikimedia
from .sources.met import fetch_met
from .sources.europeana import fetch_europeana
from .downloader import content_hash, safe_filename
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
            except Exception as exc:
                print(f"    [warn] failed to fetch {result.download_url}: {exc}")
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
            manifest = merge_entries(manifest, new_entries)
            print(f"    -> {len(new_entries)} new images")

    save_manifest(manifest_path, manifest)
    print(f"\nDone. {len(manifest)} total images in manifest.")
