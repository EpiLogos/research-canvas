# Research Canvas surfaces — research findings

**Date:** 2026-08-08
**Run:** wayfinder research tickets #5, #6, #7
**Purpose:** ground the Temporal Place contract, the psychogeographic surface stack, and the
media pipeline in real, license-checked sources. Each section ends with the locked decision.

---

## 1. Historical geography datasets and services (ticket #5)

### Offline-capable gazetteers and geodata

| Dataset / service | What it gives | License | Offline | Notes |
|---|---|---|---|---|
| **Pleiades** | Ancient-world gazetteer: 41,480 place resources (v4.1, 2025-05-28); names, locations with accuracy metadata, place types, time periods, hierarchy refs | CC BY | Yes — JSON/CSV/RDF dumps | Versioned releases on GitHub (`isawnyu/pleiades.datasets`), archived on Zenodo/archive.org; includes `places_accuracy.csv` for positional accuracy |
| **Wikidata** | Coordinates + temporal qualifiers (inception, dissolution, start/end time), hierarchy (`P131` located in), multilingual names | CC0 | Yes — full dumps | WHG already indexes 3.6M+ Wikidata place records; the time-bounded identity backbone |
| **GeoNames** | 11M+ place names incl. alternate names, admin hierarchy, coordinates | CC BY 4.0 (free download) | Yes — `allCountries.zip` etc. | Standard modern baseline; powers many offline geocoders |
| **OpenHistoricalMap** | Historical map features with start/end dates, boundaries over time | ODbL database; per-object licensing (CC0 encouraged) | Yes — extracts | Affiliated with OpenStreetMap US; use for boundaries-over-time |
| **GB1900** | Crowd-sourced gazetteer of Great Britain ~1900 | CC0 (via Vision of Britain) | Yes | Useful test corpus for one region/period |
| **Natural Earth** | Base-map admin/cultural/physical data at multiple scales | Public domain | Yes | Base-map cartography only |
| **SRTM / Copernicus DEM** | Elevation for terrain | Free, attribution required | Yes | Terrain tiles packaged locally |

### Live services (enrichment only)

| Service | What it gives | License posture | Offline constraint |
|---|---|---|---|
| **World Historical Gazetteer (WHG)** — University of Pittsburgh | Aggregated historical index + geocoding API; 47M+ records (GeoNames + Wikidata + contributed datasets) | Per-source licenses (CC0, CC BY, …); account/ORCiD required for downloads; platform can be self-hosted per docs | API requires network; bulk download requires account |
| **OldMapsOnline / Georeferencer** | Aggregator of scanned historical maps; metadata API | Per-map rights — many public domain scans | Metadata via API; raster bulk download restricted per-map |
| **Pelagios Commons** (Peripleo, Recogito) | Linked-data place lookups across partners | Partner licenses vary: CC0, CC BY, CC BY-SA, CC BY-NC-ND | No single dump; per-partner datasets; Recogito for annotation |
| **Nominatim / Photon (remote)** | Modern geocoding | OSM data ODbL; Photon software Apache-2.0 | Live only; local instances also exist |

### Geocoding for offline use

- **Photon** (Apache-2.0 software) — geocoder built on OpenStreetMap data; runs locally against
  a downloaded index.
- **Nominatim** (local instance) — full OSM geocoding stack; ODbL data.
- **GeoNames local index** — lightweight name→coordinate lookup, CC BY 4.0.

### Licensing posture

- ODbL (OSM/OHM): attribution + share-alike if we distribute derived databases.
- CC BY (Pleiades, GeoNames): attribution required; no share-alike.
- CC0 (Wikidata, GB1900): free.
- The bundle manifest must carry attribution for every shipped dataset.

### Decision

Offline-first gazetteer tier: Pleiades (ancient), Wikidata (time-bounded identity +
hierarchy), GeoNames (modern baseline), OpenHistoricalMap (boundaries), Natural Earth (base).
Live enrichment: WHG API, OldMapsOnline, Pelagios partners, remote Nominatim/Photon — explicit
opt-in only. Local Photon/Nominatim for offline geocoding. Attribution carried in the bundle
manifest.

---

## 2. Map, globe, and street-view stack (ticket #6)

| Component | Candidate | License | Offline notes |
|---|---|---|---|
| Map rendering | **MapLibre GL JS** | BSD-3-Clause | Vector/raster tiles, terrain, and (v4+) globe projection; works from local tile files |
| Globe rendering | MapLibre globe projection (v4+); **CesiumJS** as fallback | BSD-3-Clause / Apache-2.0 | CesiumJS is Apache-2.0 and supports 3D Tiles (OGC Community Standard); Cesium World Terrain / ion assets are commercial and not offline without a license |
| Offline tile packaging | **PMTiles** (single-file archive) or **MBTiles** (SQLite archive) | BSD/MIT-style per repo | PMTiles works from a local file path (or IndexedDB blob); MBTiles requires the archive locally |
| Tile building | **Planetiler** (OSM extracts → vector tiles); **Martin** (local tile server) | Apache-2.0 | Both run fully locally |
| Basemap data | OpenStreetMap extracts; OpenHistoricalMap extracts; Natural Earth | ODbL / ODbL / public domain | Ship a region/globe subset; carry attribution |
| Terrain | SRTM / Copernicus DEM → quantized-mesh tiles | Free, attribution | Package locally; or start terrain-less |
| Street view | Own captured/imported imagery (core); **Mapillary** as live opt-in | Own media: full control; Mapillary images CC BY-SA 4.0 | Mapillary requires an API token; bulk offline use not viable; Google Street View excluded (ToS forbids caching/offline) |

### Privacy notes

- Runtime requires no third-party tile hosts; all tile requests stay local.
- OSM/OHM-derived tiles carry ODbL attribution; any shipped Mapillary-derived content carries
  CC BY-SA attribution and share-alike.
- Locally captured street imagery keeps faces/license plates redaction in our own pipeline
  (Mapillary's blurring only applies on their platform).

### Decision

Map + globe = MapLibre GL JS (globe projection in v4+), offline PMTiles/MBTiles built with
Planetiler from OSM/OHM extracts and served by Martin when needed; terrain-less globe or
locally packaged DEM for v1; street view = own captured imagery first, Mapillary as explicit
live opt-in; Google Street View excluded. CesiumJS remains the fallback if 3D Tiles needs
outgrow MapLibre.

---

## 3. Media pipeline (ticket #7)

| Stage | Candidate | License | Notes |
|---|---|---|---|
| Normalization | **ffmpeg** | LGPL/GPL (build-dependent) | Probe, audio extraction, chunking, thumbnails |
| Transcription | **faster-whisper** (primary) / **whisper.cpp** | MIT | faster-whisper: CTranslate2, up to ~4x faster than reference Whisper, `word_timestamps=True`, Silero VAD, 99 languages (incl. German, Arabic); whisper.cpp: ggml, good on Apple Silicon/CPU |
| Models | Whisper large-v3 / large-v3-turbo | MIT weights | One-time download (~1–3 GB), then fully offline |
| Alignment / diarization | **WhisperX** (wav2vec2 forced alignment; pyannote speakers) | BSD-2-Clause; pyannote model card terms | Optional accuracy stage for word timestamps and speakers |
| Passage records | Segments/words → media timestamp ranges (native unit for audio/video) | — | Structured JSON + WebVTT emission |
| Playback / sync | Browser-native audio/video + WebVTT cues, `timeupdate` highlighting | W3C standards | Large media served locally with range requests |
| Storage | Content-addressed raw blobs (hash-named) + sidecar metadata + SQLite index | — | Raw files immutable; derived transcripts separate objects |

### Privacy

All inference is local; audio/video never leaves the machine. Model downloads are the only
network touch and happen once, explicitly.

### Decision

ffmpeg normalization → faster-whisper (whisper.cpp on constrained machines) with word-level
timestamps → passage records (timestamp ranges) + WebVTT for sync playback; optional WhisperX
alignment/diarization; content-addressed local storage for large raw artifacts; fully local
runtime.
