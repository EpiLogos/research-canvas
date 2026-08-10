---
name: asset-fetching
description: Gather real CC-licensed/public-domain imagery for a place through the deterministic rc-asset ingest gate. Run inside the background tmux session; select an allowed source, capture provenance, fetch bytes to disk, run the gate, handle rejections, announce the report back into the session.
---

# Asset-Fetching Skill

Use this skill when asked to gather imagery for a place (street-view evidence,
scene media, walk imagery). The skill runs **inside the background tmux session**
the app hosts. The gate never fetches — you do the network fetch, then hand the
bytes + provenance to `rc-asset ingest`.

Full contract: `docs/agents/asset-fetching.md`.

## Procedure

### 1. Identify the target place and existing identity

Find the place you are gathering for. Reuse the seeded place identity (e.g.
`root-archetypal-field:place-amsterdam`) when one is given; otherwise read the
place's graph node id. Optionally note the target walk / scene ids.

### 2. Select a source and capture provenance

Pick a **public-domain / CC0 / CC BY / CC BY-SA** image from an allowed source
host:

- `wikimedia.org` (incl. `commons.wikimedia.org`, `upload.wikimedia.org`)
- `rawpixel.com`

Record **before fetching**:

- `sourceUrl` — the exact http(s) URL.
- `license` — the license text shown at the source.
- `fetchedAt` — ISO-8601 timestamp.
- `placeId` / `walkId` / `sceneId` — the identities to associate.

Prefer JPEG/PNG. Keep the file under the 10 MiB gate cap (downscale rather than
let the gate reject on size). GIF is gate-accepted but the local redaction codecs
only decode PNG/JPEG — prefer PNG/JPEG when you plan redaction regions.

### 3. Fetch the bytes to disk

Download the image to a staging path (e.g. `/tmp/rc-asset-demo/…`). Do **not**
point the gate at a URL — it reads bytes from a local path only.

### 4. Run the deterministic gate

```sh
rc-asset ingest \
  --database <path> \
  --media-root <path> \
  --profile-scope <scope> \
  --agent-session "$(tmux display-message -p '#S')" \
  --source-url <url> \
  --license "<license>" \
  --fetched-at <ISO-8601> \
  --source-path <staged file path> \
  --place <placeId> \
  --walk <walkId> \
  --scene <sceneId> \
  [--redaction-region x,y,width,height,reason,source ...] \
  [--json]
```

The gate validates (mime sniff, size cap, license allow-list, source allow-list),
content-address imports the bytes, registers a street-view image, runs the local
redaction pipeline if regions were supplied, associates place / walk / scene, and
writes the fetch record. Rejections exit non-zero with the reason.

### 5. Handle gate rejection

Read the FAIL flag(s) from the report:

| FAIL | Do |
|---|---|
| `mime` | Re-fetch a real image (the file may be HTML/truncated) |
| `size` | Downscale/compress, or deliberately raise `--cap-bytes` |
| `license` | Pick an allowed license; never relabel a restricted image |
| `source` | Use an allowed source host; never spoof a URL |

Re-run after correcting. Re-ingesting an accepted record is idempotent.

### 6. Announce the report back into the session

End with a short plain-text report:

```
# asset-fetching report — place:amsterdam
- gathered: Rembrandt tulp.jpg (JPEG, 543 KB) — public domain
- source: https://commons.wikimedia.org/wiki/File:...
- gate: ACCEPTED (mime PASS size PASS license PASS source PASS)
- streetViewImageId: <id>
- redactionStatus: redacted (1 face region)
- association: place=root-archetypal-field:place-amsterdam
- fetchRecordId: <id>
```
