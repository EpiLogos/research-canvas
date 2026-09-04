/**
 * Data posture policy (vision §3.10, ticket #2): the psychogeographic surface
 * is offline-first. Live services are explicit opt-in per surface and per
 * action — no data leaves the machine unless the user consents to that
 * specific action, and every live call is surfaced by a visible indicator.
 */
export const LIVE_SERVICE_KINDS = [
  "tile_refresh",
  "geocoding_enrichment",
  "gazetteer_lookup",
  "street_view_browse",
] as const;
export type LiveServiceKind = (typeof LIVE_SERVICE_KINDS)[number];

export type ConnectionState = "offline" | "opted_in" | "active";

export type LiveActionDecision = "granted" | "denied";

export interface LiveServicePolicy {
  /** The surface-wide indicator state: offline by default, `active` only
   * while a consented live call is in flight. */
  state(): ConnectionState;
  isOptedIn(kind: LiveServiceKind): boolean;
  optIns(): ReadonlySet<LiveServiceKind>;
  /** The reason shown on the connection indicator while a live call is
   * active, so the user always sees exactly what is being fetched. */
  activeReason(): string | null;
  /** Per-action consent: enabling a kind is the user's explicit opt-in. */
  optIn(kind: LiveServiceKind, reason: string): boolean;
  optOut(kind: LiveServiceKind): void;
  /** Gate one live call. Grants only after an explicit opt-in for that kind,
   * and flips the indicator to `active` until `complete` is called. */
  requestLiveAction(kind: LiveServiceKind, reason: string): LiveActionDecision;
  complete(): void;
}

export function createLiveServicePolicy(
  initialOptIns: Iterable<LiveServiceKind> = [],
): LiveServicePolicy {
  const optIns = new Set<LiveServiceKind>(initialOptIns);
  let active = false;
  const reasons = new Map<LiveServiceKind, string>();
  let activeKindReason: string | null = null;

  return {
    state() {
      if (active) return "active";
      return optIns.size > 0 ? "opted_in" : "offline";
    },
    isOptedIn(kind) {
      return optIns.has(kind);
    },
    optIns() {
      return new Set(optIns);
    },
    activeReason() {
      return active ? activeKindReason : null;
    },
    optIn(kind, reason) {
      if (!LIVE_SERVICE_KINDS.includes(kind)) return false;
      reasons.set(kind, reason);
      optIns.add(kind);
      return true;
    },
    optOut(kind) {
      optIns.delete(kind);
      reasons.delete(kind);
      active = false;
      activeKindReason = null;
    },
    requestLiveAction(kind, reason) {
      if (!optIns.has(kind)) return "denied";
      reasons.set(kind, reason);
      active = true;
      activeKindReason = reason;
      return "granted";
    },
    complete() {
      active = false;
      activeKindReason = null;
    },
  };
}
