import { describe, expect, test } from "vitest";

import {
  consentedPassages,
  passageConsentSchema,
  redactedSpanSchema,
  type PassageConsent,
} from "./consent";
import type { PassageRef } from "./passage";

const passageA: PassageRef = {
  artifactId: "recording-001",
  unit: { kind: "timestamp_range", startMs: 0, endMs: 10_000 },
};
const passageB: PassageRef = {
  artifactId: "recording-001",
  unit: { kind: "timestamp_range", startMs: 10_000, endMs: 20_000 },
};

function consent(
  passage: PassageRef,
  over: Partial<PassageConsent> = {},
): PassageConsent {
  return passageConsentSchema.parse({
    passageRef: passage,
    state: "captured",
    scope: "publication",
    capturedAt: "2026-08-08T10:00:00.000Z",
    ...over,
  });
}

describe("passageConsentSchema", () => {
  test("withdrawal requires a withdrawnAt timestamp", () => {
    expect(
      passageConsentSchema.safeParse({
        passageRef: passageA,
        state: "withdrawn",
        scope: "publication",
        capturedAt: "2026-08-08T10:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      passageConsentSchema.safeParse({
        passageRef: passageA,
        state: "withdrawn",
        scope: "publication",
        capturedAt: "2026-08-08T10:00:00.000Z",
        withdrawnAt: "2026-08-09T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});

describe("consentedPassages", () => {
  test("publishes only captured passages and attaches redacted spans as gaps", () => {
    const published = consentedPassages(
      [passageA, passageB],
      [consent(passageA)],
      [
        redactedSpanSchema.parse({
          passageRef: passageA,
          startOffset: 1,
          endOffset: 3,
        }),
      ],
    );
    expect(published).toHaveLength(1);
    expect(published[0].passage).toEqual(passageA);
    expect(published[0].gaps).toEqual([{ startOffset: 1, endOffset: 3 }]);
  });

  test("withdrawn consent never publishes, even after a capture", () => {
    const published = consentedPassages(
      [passageA],
      [
        consent(passageA, { state: "captured" }),
        consent(passageA, {
          state: "withdrawn",
          withdrawnAt: "2026-08-09T10:00:00.000Z",
        }),
      ],
      [],
    );
    expect(published).toEqual([]);
  });

  test("a re-captured passage publishes again after an earlier withdrawal", () => {
    const published = consentedPassages(
      [passageA],
      [
        consent(passageA, {
          state: "withdrawn",
          withdrawnAt: "2026-08-09T10:00:00.000Z",
        }),
        consent(passageA, { capturedAt: "2026-08-10T10:00:00.000Z" }),
      ],
      [],
    );
    expect(published.map((entry) => entry.passage)).toEqual([passageA]);
  });

  test("no recorded consent means no publication", () => {
    expect(consentedPassages([passageA, passageB], [], [])).toEqual([]);
  });

  test("passage identity is order-independent across serde and zod key orderings", () => {
    // Rust's serde serialises the text_span unit in field order
    // endOffset/kind/startOffset; zod-parsed scenes produce schema order
    // kind/startOffset/endOffset. Consent records written by Rust must still
    // match the parsed scene passages they were captured against.
    const rustUnit = {
      endOffset: 6684,
      kind: "text_span",
      startOffset: 6079,
    } as const;
    const parsedUnit = {
      kind: "text_span",
      startOffset: 6079,
      endOffset: 6684,
    } as const;
    const rustConsent = consent({
      artifactId: "Report8.md",
      unit: rustUnit,
    });
    const redaction = redactedSpanSchema.parse({
      passageRef: {
        artifactId: "Report8.md",
        unit: rustUnit,
      },
      startOffset: 6321,
      endOffset: 6454,
    });

    const published = consentedPassages(
      [{ artifactId: "Report8.md", unit: parsedUnit }],
      [rustConsent],
      [redaction],
    );
    expect(published).toHaveLength(1);
    expect(published[0].gaps).toEqual([
      { startOffset: 6321, endOffset: 6454 },
    ]);
  });
});
