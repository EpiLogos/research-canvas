# Agentic Asset Gathering — the `asset-fetching` skill

Refinement-2 D3, ticket #20. This is the skill spec for gathering real imagery
**in the background tmux session**, and the contract of the deterministic
app-side gate (`rc-asset ingest`) that is the trust boundary on what an agent
produces.

The terminal is the **access point to the agent**, not a dumb fetch pipe. The
app hosts a durable per-workspace tmux session; agents run research/fetch skills
inside it. The app **never fetches on its own** — the agent is the explicit live
opt-in, and the gate stays offline-first.

---

## 1. The background tmux session contract

The embedded terminal is a **durable per-workspace tmux session**, created and
re-joined with:

```sh
tmux new-session -A -s <name> -c <workdir>
```

(`apps/desktop/src-tauri/src/pty/session.rs`, verified in the codebase.)

- **Durable session name**: `research-canvas-{hash:016x}`, an FNV-1a hash of the
  canonical workspace directory. Reopening the workspace terminal **rejoins the
  same session** instead of starting a fresh shell — an app update or panel
  remount keeps the agent's state.
- **`agentSessionId`**: the fetch-record contract's `agentSessionId` links to
  the tmux session that produced the asset. Inside the session an agent obtains
  it with:

  ```sh
  tmux display-message -p '#S'   # e.g. research-canvas-a7f3...
  ```

  If the app exports `RESEARCH_CANVAS_SESSION_ID`, prefer that value; it is the
  same durable identity in a machine-readable form.
- The session runs in the workspace directory (`-c <workdir>`), so the agent has
  the repo and the fetched-bytes staging area on disk.
- The agent announces results **back into the session** (plain text at the end of
  the run) — the app surfaces the terminal pane; it does not parse agent chat.

### What the app does / does not do

| Concern | App | Agent |
|---|---|---|
| Network fetch of an image | Never | Yes (explicit live opt-in) |
| Host the durable tmux session | Yes | Inside it |
| Validate mime / byte-size / license / source | Yes (`rc-asset ingest`) | Passes bytes + provenance to the gate |
| Import bytes into the media store | Yes (content-addressed) | — |
| Local redaction pipeline | Yes | May attach regions |
| Provenance record | Yes (fetch record) | Supplies source URL + license + timestamp |

---

## 2. The skill (`asset-fetching`)

The skill is authored in the repo agent-skill format (pattern:
`.claude/skills/build-movement.md`) at `.claude/skills/asset-fetching.md`.
When asked to "gather imagery for place X", the agent follows this procedure.

### 2.1 Choose the image intelligently

- Prefer **public-domain / freely-licensed** imagery from a known-good source
  host (see §3 allow-lists): Wikimedia Commons first, then other listed hosts.
- The image must be **relevant to the target place**: a street scene, building,
  canal, landscape, or artefact with a clear geographical reference.
- Prefer the **original or near-original resolution** but stay under the gate's
  byte-size cap (default **10 MiB**; the gate can raise it per-run with
  `--cap-bytes`). Downscale rather than let the gate reject on size.
- Prefer **JPEG/PNG**; GIF is accepted at the gate but the local redaction
  codecs can only decode PNG/JPEG, so a GIF with redaction regions will fail the
  redaction step (visible in the run; re-fetch as PNG/JPEG).

### 2.2 Capture provenance before you fetch

For every candidate, record at minimum:

- `sourceUrl` — the exact http(s) URL the bytes come from.
- `license` — the license text verified at the source (see §3 allow-list).
- `fetchedAt` — ISO-8601 retrieval timestamp (the gate defaults to now if you
  omit it).
- `placeId` / `walkId` / `sceneId` — the existing place / walk / scene identity
  to associate the image with (optional but recommended; reuse the seeded
  identities, e.g. `root-archetypal-field:place-amsterdam`).

Save the fetched bytes to a staging path on disk (e.g.
`/tmp/rc-asset-demo/…`). **The gate reads bytes from disk; it never fetches.**

### 2.3 Run the gate

```sh
rc-asset ingest \
  --database <path> \
  --media-root <path> \
  --profile-scope <scope> \
  --agent-session "$(tmux display-message -p '#S')" \
  --source-url <url> \
  --license "<license>" \
  --fetched-at <ISO-8601> \
  --source-path <path to fetched bytes> \
  --place <placeId> \
  --walk <walkId> \
  --scene <sceneId> \
  [--redaction-region x,y,width,height,reason,source ...] \
  [--json]
```

The gate then:

1. **Validates** mime type (magic-byte sniff), byte size against the cap,
   license against the allow-list, source host against the allow-list.
2. **Content-address imports** the bytes into the media store at
   `street-view/imported/{sha256}.{ext}` (identical bytes dedup naturally).
3. **Registers** a street-view image (pending redaction).
4. **Runs the local redaction pipeline** if regions were supplied
   (`pending → detected/manual regions → redacted derived copy`; raw bytes are
   never modified).
5. **Associates** the image with place / walk / scene and **writes the fetch
   record** — one row per attempt, accepted **or** rejected.

### 2.4 Reporting format

End the run with a short plain-text report announced back into the session:

```
# asset-fetching report — place:amsterdam
- gathered: Rembrandt tulp.jpg (JPEG, 543 KB) — public domain
- source: https://commons.wikimedia.org/wiki/File:Rembrandt_..._tulp.jpg
- gate: ACCEPTED (mime PASS size PASS license PASS source PASS)
- streetViewImageId: <id>
- redactionStatus: redacted (1 face region)
- association: place=root-archetypal-field:place-amsterdam
- fetchRecordId: <id>
```

### 2.5 Gate-rejection handling

A rejection is **not** a hard error: the gate writes a fetch record with the
failing `validation` flags and exits non-zero (`rc-asset ingest` prints the
reason). The agent must read the FAIL flag(s) and correct course:

| FAIL flag | Cause | Agent action |
|---|---|---|
| `mime` | bytes don't sniff as PNG/JPEG/GIF | Re-fetch as a real image; check the file wasn't truncated/HTML |
| `size` | over the byte-size cap | Downscale/compress and re-fetch, or raise `--cap-bytes` deliberately |
| `license` | not in the allow-list | Pick a CC0/CC BY/public-domain source; do not relabel a restricted image |
| `source` | host not on the allow-list | Use a listed source host; never spoof a source URL |

Do **not** re-run with `--json` and ignore the exit code: the fetch record is
the audit trail, and an accepted record is idempotent (re-ingesting the same
session + source URL + byte hash returns the existing record instead of
duplicating bytes).

---

## 3. Allow-lists (authoritative in `commands/fetch_asset.rs`)

- **Licenses**: `CC0`, `CC BY`, `CC BY-SA`, `PD`, `public domain`,
  `public-domain` (case-insensitive).
- **Source hosts**: `wikimedia.org` (covers `commons.wikimedia.org`,
  `upload.wikimedia.org`), `rawpixel.com` (suffix match).
- **Mime**: `image/png`, `image/jpeg`, `image/gif` (magic-byte sniffed).
- **Byte-size cap**: 10 MiB default.

---

## 4. Fetch record contract

```ts
{
  id, agentSessionId, sourceUrl, license, fetchedAt,
  mimeType, byteSize,
  validation: { mimeOk, sizeOk, licenseOk, sourceOk },
  artifactPath, redactionStatus,
  placeId?, walkId?, sceneId?
}
```

`artifactPath` is empty for rejected attempts. `redactionStatus` is one of
`pending | redacted | none_needed`. The frontend reads records exclusively
through `WorkspaceTransport.listFetchRecords` / `ingestFetchedAsset`
(`packages/desktop-api`); the web build swaps in the read-only browser-bridge
transport. The gate and store live entirely in SQLite; no new substrate node or
relationship categories are introduced.
