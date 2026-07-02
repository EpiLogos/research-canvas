export const MS_PER_DAY = 86_400_000;

/**
 * Convert an ISO-8601 date / datetime / bare-year string into a fractional
 * Gregorian year. Returns null when the input is null, empty, or unparseable.
 * Astronomical year numbering: "-0043-01-01" => -43 (43 BCE), year 0 exists.
 */
export function parseTemporalInstant(iso: string | null): number | null {
  if (iso === null) return null;
  const trimmed = iso.trim();
  if (trimmed === "") return null;

  // Bare year, optionally signed: "1917", "-0043".
  const bareYear = /^(-?\d{1,6})$/u.exec(trimmed);
  if (bareYear) {
    const year = Number.parseInt(bareYear[1], 10);
    return Number.isNaN(year) ? null : year;
  }

  // Signed full date/datetime: capture the leading (possibly negative) year,
  // then let Date parse the absolute calendar value for the fractional part.
  const dateMatch = /^(-?)(\d{1,6})-(\d{2})-(\d{2})/u.exec(trimmed);
  if (!dateMatch) return null;
  const sign = dateMatch[1] === "-" ? -1 : 1;
  const year = Number.parseInt(dateMatch[2], 10);

  // Build a UTC date for the absolute year to measure the day-of-year fraction.
  const yearStart = Date.UTC(year, 0, 1);
  const nextYearStart = Date.UTC(year + 1, 0, 1);
  const month = Number.parseInt(dateMatch[3], 10) - 1;
  const day = Number.parseInt(dateMatch[4], 10);
  const at = Date.UTC(year, month, day);
  if (Number.isNaN(at)) return null;
  const fractionOfYear = (at - yearStart) / (nextYearStart - yearStart);

  return sign * year + (sign < 0 ? -fractionOfYear : fractionOfYear);
}
