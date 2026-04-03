# fetch-image-assets — Design Spec
*2026-04-01*

## Purpose

A general-purpose image acquisition pipeline for research and production work. Given a YAML config describing what to find, it fetches public-domain and open-licensed imagery from multiple cultural heritage and image sources, organizes it by category, and produces a citable manifest. A Claude skill wraps the pipeline — reading any source document (episode spec, research notes, reading list), extracting asset targets, writing the config, and running the fetch.

The tool is source-agnostic: it knows nothing about episodes. It fetches images. The skill knows how to read research material and produce good queries.

---

## Asset Categories

The config supports five asset categories, each with its own query strategy:

| Category | What it fetches | Example targets |
|----------|-----------------|-----------------|
| `symbols` | Depictions of a symbol across media and periods | Eagle, lamb, wolf, ouroboros |
| `figures` | Portraits, photos, and likenesses of a historical person | Cosimo de' Medici, Aleister Crowley |
| `books` | Book cover images, title pages, author portraits | *The Prince*, *Morals and Dogma* |
| `artworks` | Specific named paintings, sculptures, or works | Goya's *Saturn*, Blake's *Nebuchadnezzar* |
| `photos` | Historical photographs, press images, documentary stills | MK-ULTRA documents, Cold War imagery |

Each category entry has a `queries` array — 3–5 rich, varied search strings (medium, period, style keywords, not just the noun) — and an optional `limit` override.

---

## Config Format (`assets.yaml`)

```yaml
target_per_category: 10   # default images per entry across all sources
output_dir: episodes/ep-0.2/assets   # can be overridden by CLI arg

symbols:
  eagle:
    queries:
      - "eagle Roman empire mosaic Byzantine"
      - "eagle solar heraldry medieval illumination"
      - "eagle engraving 18th century"
    limit: 15

figures:
  cosimo_de_medici:
    label: "Cosimo de' Medici"
    queries:
      - "Cosimo de Medici portrait painting Renaissance"
      - "Pontormo Medici portrait"

books:
  the_prince_machiavelli:
    label: "The Prince — Machiavelli"
    queries:
      - "Il Principe Machiavelli title page woodcut"
      - "The Prince Machiavelli early edition cover"

artworks:
  goya_saturn:
    label: "Saturn Devouring His Son — Goya"
    queries:
      - "Goya Saturn devouring son painting"
      - "Francisco Goya Black Paintings"

photos:
  mkultra_documents:
    label: "MK-ULTRA"
    queries:
      - "CIA MK-ULTRA declassified document photograph"
      - "mind control Cold War declassified"
```

---

## Script: `tools/fetch-image-assets.py`

### CLI

```bash
python tools/fetch-image-assets.py <config.yaml> [output-dir]
```

`output-dir` overrides the `output_dir` field in the config. If neither is set, defaults to `./assets`.

### Sources

Three sources queried in parallel per entry (asyncio + httpx):

**Wikimedia Commons**
- API: `action=query&generator=search&gsrnamespace=6` (File namespace)
- Filter: image mimetypes only (jpg, png, tif)
- Metadata fetch: `action=query&prop=imageinfo` for title, artist, date, license, URL

**The Met Open Access API**
- Search: `GET /public/collection/v1/search?q=<query>&hasImages=true`
- Object: `GET /public/collection/v1/objects/{id}` — filter `isPublicDomain: true`
- Metadata: `title`, `artistDisplayName`, `objectDate`, `primaryImageSmall`

**Europeana**
- Search: `GET /api/v2/search.json?query=<q>&qf=TYPE:IMAGE&reusability=open`
- Metadata: `title`, `dcCreator`, `year`, `edmIsShownBy`, `rights`
- Requires free API key (stored in `~/.secrets/europeana-api-key.txt`)

### Behavior

- Each entry fetches up to `limit` images total, spread across sources
- Downloads skip duplicates by content hash (not filename)
- Output path: `<output-dir>/<category>/<entry-key>/<filename>`
- Rate-limit retries with exponential backoff (max 3 retries)
- Skips non-image responses, 404s, and paywalled content silently
- Logs failures to stderr without crashing

### Manifest

Writes/merges `<output-dir>/manifest.json`:

```json
[
  {
    "category": "symbols",
    "key": "eagle",
    "label": "Eagle",
    "local_path": "symbols/eagle/eagle-roman-mosaic-byzantine-001.jpg",
    "title": "Eagle mosaic, Ravenna",
    "artist": "Unknown",
    "date": "c. 5th century",
    "source": "wikimedia",
    "license": "Public Domain",
    "source_url": "https://commons.wikimedia.org/wiki/File:..."
  }
]
```

---

## Skill: `fetch-image-assets`

**Location:** `~/.claude/skills/fetch-image-assets/SKILL.md`

**Trigger:** `/fetch-image-assets` with a path to source material (episode spec, research notes, reading list, or freeform description)

**What Claude does:**

1. Reads the source document(s)
2. Extracts all asset targets across all five categories:
   - Symbols and archetypes mentioned
   - Historical figures named or implied
   - Books, texts, or works cited
   - Specific artworks referenced
   - Historical events or contexts that have documentary photo records
3. For each target, writes 3–5 rich, specific search queries — varying medium, period, style, and cultural context
4. Writes or updates `assets.yaml` at a sensible location (next to source doc, or at `--config` path if specified)
5. Runs: `python tools/fetch-image-assets.py assets.yaml [output-dir]`
6. Reports: total images downloaded, per-source breakdown, any failures

**Invocation examples:**

```
/fetch-image-assets episodes/ep-0.2/Episode_0_2_The_Fire_of_the_Gods_v4.md
/fetch-image-assets episodes/ep-0.2/ --output episodes/ep-0.2/assets
/fetch-image-assets "Medici banking, eagle heraldry, MK-ULTRA" --output research/assets
```

---

## File Layout

```
tools/
  fetch-image-assets.py         # the script

~/.claude/skills/
  fetch-image-assets/
    SKILL.md                    # skill definition

episodes/
  ep-0.2/
    assets.yaml                 # generated by skill, editable
    assets/
      manifest.json
      symbols/
        eagle/
        lion/
        wolf/
      figures/
        cosimo_de_medici/
      books/
        the_prince_machiavelli/
      artworks/
        goya_saturn/
      photos/
        mkultra_documents/
```

---

## Out of Scope

- AI-generated images (use `nanobanana-gemini` for that)
- Paid image APIs (Getty, Shutterstock)
- Video or audio assets
- Automatic tagging or AI captioning of downloaded images
