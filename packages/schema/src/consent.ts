import { z } from "zod";

import {
  passageRefKey,
  passageRefSchema,
  passageUnitKey,
  type PassageRef,
} from "./passage";

/**
 * Consent and redaction are passage-level derived artifacts (vision §3.13,
 * ticket #8): the storyteller's voice is canonical, consent is a separate
 * object scoped to a passage, and publication renders only consented
 * passages — redacted spans appear as gaps, never as edited content.
 */
export const CONSENT_STATES = ["captured", "withdrawn"] as const;
export const consentStateSchema = z.enum(CONSENT_STATES);

export const passageConsentSchema = z
  .object({
    passageRef: passageRefSchema,
    state: consentStateSchema,
    /** What the consent covers, e.g. `publication` or `research-use`. */
    scope: z.string().min(1),
    capturedAt: z.string().datetime(),
    withdrawnAt: z.string().datetime().optional(),
    recordedBy: z.string().optional(),
  })
  .superRefine((consent, ctx) => {
    if (consent.state === "withdrawn" && !consent.withdrawnAt) {
      ctx.addIssue({
        code: "custom",
        message: "withdrawn consent requires a withdrawnAt timestamp",
        path: ["withdrawnAt"],
      });
    }
  });

/** A span of a consented passage rendered as a gap at publication time. */
export const redactedSpanSchema = z.object({
  passageRef: passageRefSchema,
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
});

export type ConsentState = z.infer<typeof consentStateSchema>;
export type PassageConsent = z.infer<typeof passageConsentSchema>;
export type RedactedSpan = z.infer<typeof redactedSpanSchema>;

export interface PublicationPassage {
  passage: PassageRef;
  /** Redacted spans within this passage; publication renders them as gaps. */
  gaps: Array<{ startOffset: number; endOffset: number }>;
}

/**
 * The publication filter: returns only passages with captured consent for
 * the requested scope, attaching their redacted spans. Withdrawn consent
 * never publishes, and a passage with no recorded consent is excluded by
 * default — publication is consent-filtered at export time (§3.16).
 */
export function consentedPassages(
  passages: PassageRef[],
  consents: PassageConsent[],
  redactions: RedactedSpan[],
  scope = "publication",
): PublicationPassage[] {
  const key = passageRefKey;
  const consented = new Map<string, PassageConsent>();
  for (const consent of consents) {
    if (consent.scope !== scope) continue;
    const weight = consentWeight(consent);
    const existing = consented.get(key(consent.passageRef));
    if (!existing) {
      consented.set(key(consent.passageRef), consent);
      continue;
    }
    // The chronologically latest record decides: a withdrawal after capture
    // revokes; a capture after withdrawal re-consents.
    if (weight >= consentWeight(existing)) {
      consented.set(key(consent.passageRef), consent);
    }
  }

  const published: PublicationPassage[] = [];
  for (const passage of passages) {
    const consent = consented.get(key(passage));
    if (!consent || consent.state === "withdrawn") continue;
    const gaps = redactions
      .filter(
        (span) =>
          span.passageRef.artifactId === passage.artifactId &&
          passageUnitKey(span.passageRef.unit) === passageUnitKey(passage.unit),
      )
      .map((span) => ({
        startOffset: span.startOffset,
        endOffset: span.endOffset,
      }));
    published.push({ passage, gaps });
  }
  return published;
}

function consentWeight(consent: PassageConsent): number {
  const value =
    consent.state === "withdrawn"
      ? consent.withdrawnAt ?? consent.capturedAt
      : consent.capturedAt;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
