export function normalizeSearchQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeSearchQuery(value: string) {
  const normalized = normalizeSearchQuery(value);
  return normalized ? normalized.split(/\s+/) : [];
}
