import assert from "node:assert/strict";
import test from "node:test";

import {
  auditCorpusKnowledge,
  PRODUCTION_CORPUS_MINIMUMS,
} from "./audit-corpus-knowledge.mjs";

test("reports unresolved wikilinks without silently choosing a similarly named target", () => {
  const report = auditCorpusKnowledge({
    schemaVersion: 1,
    sources: [
      { path: "vault/a.md", role: "source" },
      { path: "vault/declared.md", role: "source" },
    ],
    linkTargets: { declared: "graph:declared-node" },
    documents: [
      {
        slug: "a",
        contentRevision: 2,
        sourceCoordinates: ["vault/a.md#document"],
        wikilinks: ["b", "declared", "missing"],
        body: JSON.stringify([
          { type: "heading", content: [{ type: "text", text: "A" }] },
          { type: "paragraph", content: [{ type: "text", text: "A real reader body." }] },
        ]),
      },
      {
        slug: "b",
        contentRevision: 2,
        sourceCoordinates: ["vault/b.md#document"],
        wikilinks: [],
        body: JSON.stringify([
          { type: "heading", content: [{ type: "text", text: "B" }] },
          { type: "paragraph", content: [{ type: "text", text: "Another reader body." }] },
        ]),
      },
    ],
  });

  assert.equal(report.documentCount, 2);
  assert.equal(report.resolvedWikilinkCount, 2);
  assert.deepEqual(report.unresolvedWikilinks, [{ sourceSlug: "a", target: "missing" }]);
  assert.deepEqual(report.shallowDocuments, []);
});

test("reports an explicit corpus-coverage failure instead of treating a small linked sample as production-ready", () => {
  const report = auditCorpusKnowledge(
    {
      schemaVersion: 1,
      sources: [{ path: "vault/a.md", role: "source" }],
      documents: [
        {
          slug: "a",
          contentRevision: 1,
          sourceCoordinates: ["vault/a.md#document"],
          wikilinks: [],
          body: JSON.stringify([
            { type: "heading", content: [{ type: "text", text: "A" }] },
            { type: "paragraph", content: [{ type: "text", text: "Deep source body." }] },
          ]),
        },
      ],
    },
    { minimums: { documents: 2, sources: 2, resolvedWikilinks: 1 } },
  );

  assert.deepEqual(report.coverageFailures, [
    "documentCount 1 is below required minimum 2",
    "sourceCount 1 is below required minimum 2",
    "resolvedWikilinkCount 0 is below required minimum 1",
  ]);
});

test("production corpus gate protects the expanded Episode 1/2 source surface", () => {
  assert.deepEqual(PRODUCTION_CORPUS_MINIMUMS, {
    documents: 60,
    sources: 23,
    resolvedWikilinks: 100,
  });
});
