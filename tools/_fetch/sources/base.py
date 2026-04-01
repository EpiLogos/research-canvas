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
