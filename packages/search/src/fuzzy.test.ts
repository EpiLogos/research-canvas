import { describe, expect, it } from "vitest";

import { rankSearchResults } from "./fuzzy";

describe("rankSearchResults", () => {
  it("prefers exact and prefix matches over loose substring matches", () => {
    const ranked = rankSearchResults("report", [
      { id: "1", text: "Report" },
      { id: "2", text: "Report 7" },
      { id: "3", text: "Supporting report notes" },
      { id: "4", text: "Notebook" }
    ]);

    expect(ranked.map((entry) => entry.id)).toEqual(["1", "2", "3"]);
  });

  it("normalizes casing and punctuation in the query", () => {
    const ranked = rankSearchResults("episode-flow", [
      { id: "1", text: "Episode flow" },
      { id: "2", text: "episode_flow" },
      { id: "3", text: "Historical sequence" }
    ]);

    expect(ranked.map((entry) => entry.id)).toEqual(["1", "2"]);
  });
});
