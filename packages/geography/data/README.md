# Offline geography data

The psychogeographic surface ships with a validated offline pack built by
`scripts/build-pack.mjs`. The builder is the only writer of the `pack/`
directory — never hand-edit `pack.json`, `gazetteer.ndjson`, or
`basemap.geojson`; regenerate them instead.

## Layout

| Path | Purpose |
|---|---|
| `gazetteer.sample.ndjson` | Bundled raw subset — real Pleiades / Wikidata / GeoNames records in `GazetteerEntry` shape (see `ATTRIBUTION.md`). |
| `sources/` | Drop zone for full dumps: Pleiades places JSON, Wikidata QID exports, GeoNames `allCountries.txt` — each exported as NDJSON `GazetteerEntry` records with the source's precision. |
| `pack/gazetteer.ndjson` | Validated index records shipped to the surface. |
| `pack/pack.json` | Manifest: format version, generated-at, offline tile source, per-source attribution, record counts, entry-id integrity snapshot. |
| `pack/basemap.geojson` | Local-only basemap derived from the located records (v1 posture; Natural Earth / raster tile archives can replace it without changing the manifest contract). |

## Regenerating

```bash
node packages/geography/scripts/build-pack.mjs
```

The builder refuses records that would violate the data posture: entries with
unknown sources, points at `region`/`unlocated` precision, missing WGS84
bounds, and any live tile host in the manifest. The runtime parser
(`parseGeographyPack`) re-checks all of it at load time.

## Scaling to the full production pack

The full production pack adds Natural Earth land polygons (public domain) as
the offline basemap and the complete Pleiades / Wikidata / GeoNames index.
Download the versioned dumps once, convert each to `GazetteerEntry` NDJSON in
`sources/`, and re-run the builder. Attribution for every bundled dataset is
recorded in `ATTRIBUTION.md` and regenerated into `pack.json` automatically.
