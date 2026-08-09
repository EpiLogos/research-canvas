import { describe, expect, test } from "vitest";

import { createLiveServicePolicy } from "./policy";

describe("createLiveServicePolicy", () => {
  test("is offline-first by default and denies every live action", () => {
    const policy = createLiveServicePolicy();
    expect(policy.state()).toBe("offline");
    expect(
      policy.requestLiveAction("geocoding_enrichment", "enrich search results"),
    ).toBe("denied");
    expect(policy.state()).toBe("offline");
  });

  test("grants a live call only after an explicit per-kind opt-in", () => {
    const policy = createLiveServicePolicy();
    expect(policy.optIn("tile_refresh", "refresh basemap tiles")).toBe(true);
    expect(policy.state()).toBe("opted_in");

    expect(
      policy.requestLiveAction("tile_refresh", "refresh basemap tiles"),
    ).toBe("granted");
    expect(policy.state()).toBe("active");
    expect(policy.activeReason()).toBe("refresh basemap tiles");

    policy.complete();
    expect(policy.state()).toBe("opted_in");

    // A different kind stays gated even though one kind is opted in.
    expect(
      policy.requestLiveAction("street_view_browse", "browse street imagery"),
    ).toBe("denied");
  });

  test("opt-out revokes a kind and clears the active indicator", () => {
    const policy = createLiveServicePolicy(["gazetteer_lookup"]);
    expect(policy.isOptedIn("gazetteer_lookup")).toBe(true);
    policy.optOut("gazetteer_lookup");
    expect(policy.isOptedIn("gazetteer_lookup")).toBe(false);
    expect(policy.state()).toBe("offline");
  });
});
