import assert from "node:assert/strict";
import test from "node:test";

import { auditCorpusKnowledge } from "./audit-corpus-knowledge.mjs";

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
