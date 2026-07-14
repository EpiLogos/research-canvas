import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compileCorpusKnowledge,
  renderCompiledCorpus,
} from "./compile-corpus-knowledge.mjs";

async function fixtureCorpus() {
  const root = await mkdtemp(path.join(tmpdir(), "corpus-knowledge-"));
  await writeFile(
    path.join(root, "source.md"),
    [
      "# Root source",
      "",
      "The opening paragraph is real source material, not a generated summary; see [[other-file|other source]].",
      "",
      "## Detail",
      "",
      "The selected section preserves this detailed prose and its heading.",
      "",
      "### Further detail",
      "",
      "A second source paragraph proves that a line selection is not a title-only card.",
      "",
      "## [[position-0|#0]] — Myth",
      "",
      "A mythic heading keeps its readable alias in the portable source anchor.",
      "",
      "## Excluded",
      "",
      "This must not be included in a selection that ends before this heading.",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "knowledge-manifest.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        contentRevision: 7,
        sources: [{ path: "source.md", role: "episode-script" }],
        documents: [
          {
            slug: "source-root",
            source: "source.md",
            startHeading: "Root source",
            endHeading: "Excluded",
          },
          {
            slug: "selected-detail",
            source: "source.md",
            startText: "The selected section preserves this detailed prose and its heading.",
            endHeading: "Excluded",
            anchor: "detail-evidence",
          },
          {
            slug: "mythic-selection",
            source: "source.md",
            startHeading: "[[position-0|#0]] — Myth",
          },
        ],
      },
      null,
      2,
    ),
  );
  return root;
}

test("compiles selected source prose into portable structured reader blocks", async () => {
  const root = await fixtureCorpus();

  const compiled = await compileCorpusKnowledge({
    root,
    manifestPath: "knowledge-manifest.json",
  });

  assert.equal(compiled.schemaVersion, 1);
  assert.equal(compiled.documents[0].contentRevision, 7);
  assert.deepEqual(compiled.sources, [{ path: "source.md", role: "episode-script" }]);
  assert.equal(compiled.documents.length, 3);
  const rootDocument = compiled.documents.find((document) => document.slug === "source-root");
  assert.deepEqual(rootDocument.sourceCoordinates, ["source.md#root-source"]);
  assert.deepEqual(rootDocument.wikilinks, ["other-file", "position-0"]);
  const body = JSON.parse(rootDocument.body);
  assert.deepEqual(body[0], {
    type: "heading",
    props: { level: 1 },
    content: [{ type: "text", text: "Root source", styles: {} }],
  });
  assert.match(JSON.stringify(body), /real source material/);
  assert.match(JSON.stringify(body), /selected section preserves this detailed prose/);
  assert.doesNotMatch(JSON.stringify(body), /This must not be included/);
  const detail = compiled.documents.find((document) => document.slug === "selected-detail");
  assert.deepEqual(detail.sourceCoordinates, ["source.md#detail-evidence"]);
  assert.match(detail.body, /selected section preserves this detailed prose/);
  assert.doesNotMatch(detail.body, /opening paragraph/);
  const mythic = compiled.documents.find((document) => document.slug === "mythic-selection");
  assert.deepEqual(mythic.sourceCoordinates, ["source.md#0-myth"]);
});

test("renders the same checked-in corpus artifact from repeated compiles", async () => {
  const root = await fixtureCorpus();
  const first = renderCompiledCorpus(
    await compileCorpusKnowledge({ root, manifestPath: "knowledge-manifest.json" }),
  );
  const second = renderCompiledCorpus(
    await compileCorpusKnowledge({ root, manifestPath: "knowledge-manifest.json" }),
  );

  assert.equal(first, second);
  const artifactPath = path.join(root, "generated.json");
  await writeFile(artifactPath, first);
  assert.equal(await readFile(artifactPath, "utf8"), second);
});

test("rejects unsafe source coordinates rather than compiling an absolute or escaping path", async () => {
  const root = await fixtureCorpus();
  const manifest = JSON.parse(await readFile(path.join(root, "knowledge-manifest.json"), "utf8"));
  manifest.sources[0].path = "../outside.md";
  await writeFile(path.join(root, "knowledge-manifest.json"), JSON.stringify(manifest));

  await assert.rejects(
    () => compileCorpusKnowledge({ root, manifestPath: "knowledge-manifest.json" }),
    /relative path within the corpus root/,
  );
});
