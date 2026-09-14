import { z } from "zod";

/**
 * ISO-8601 temporal bound: `YYYY`, `YYYY-MM`, `YYYY-MM-DD`, or a full datetime
 * (with optional fractional seconds and timezone). Year-only bounds are legal
 * so a place, identity, or window can be bounded at exactly the precision the
 * source gives — never more.
 */
const ISO_BOUND_PATTERN =
  /^\d{4}(-\d{2}(-\d{2})?)?([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export const isoTemporalBoundSchema = z
  .string()
  .regex(ISO_BOUND_PATTERN, "ISO-8601 date or datetime required")
  .superRefine((value, ctx) => {
    const dayMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (dayMatch) {
      const [, year, month, day] = dayMatch;
      if (!isValidCalendarDate(Number(year), Number(month), Number(day))) {
        ctx.addIssue({
          code: "custom",
          message: "not a valid calendar date",
          path: [],
        });
      }
    } else {
      const monthMatch = /^\d{4}-(\d{2})$/.exec(value);
      if (monthMatch) {
        const month = Number(monthMatch[1]);
        if (month < 1 || month > 12) {
          ctx.addIssue({
            code: "custom",
            message: "month must be 01-12",
            path: [],
          });
        }
      }
    }
    const timeMatch = /[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
    if (timeMatch) {
      const [, hours, minutes, seconds] = timeMatch;
      if (
        Number(hours) > 23 ||
        Number(minutes) > 59 ||
        (seconds !== undefined && Number(seconds) > 59)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "time of day out of range",
          path: [],
        });
      }
    }
  });

export type IsoTemporalBound = z.infer<typeof isoTemporalBoundSchema>;

/**
 * Compares two temporal bounds when both are fully parseable instants and
 * returns `null` when either side is a partial date (year/month). Partial
 * dates are deliberately coarse, so ordering is not enforced across them.
 */
export function compareTemporalBounds(a: string, b: string): number | null {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
    return null;
  }
  if (aMs === bMs) {
    return 0;
  }
  return aMs < bMs ? -1 : 1;
}

/**
 * Adds a custom issue when `start` precedes `end` and both bounds are
 * comparable. Used by every time-bounded schema so the rule lives in one place.
 */
export function checkBoundOrder(
  start: string | null | undefined,
  end: string | null | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (start == null || end == null) {
    return;
  }
  const cmp = compareTemporalBounds(start, end);
  if (cmp !== null && cmp > 0) {
    ctx.addIssue({
      code: "custom",
      message: "end must not precede start",
      path,
    });
  }
}
