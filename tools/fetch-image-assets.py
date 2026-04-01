#!/usr/bin/env python3
"""fetch-image-assets — download public-domain imagery from Wikimedia, Met, and Europeana.

Usage:
    python fetch-image-assets.py <config.yaml> [output-dir]
"""
import asyncio
import sys
from pathlib import Path

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
