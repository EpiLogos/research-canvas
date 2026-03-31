import { normalizeSearchQuery, tokenizeSearchQuery } from "./query";

export interface SearchCandidate {
  id: string;
  text: string;
}

export interface RankedSearchCandidate extends SearchCandidate {
  score: number;
}

export function rankSearchResults(
  query: string,
  candidates: SearchCandidate[]
): RankedSearchCandidate[] {
  const normalizedQuery = normalizeSearchQuery(query);
  const tokens = tokenizeSearchQuery(query);

  if (!normalizedQuery || tokens.length === 0) {
    return [];
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      score: scoreCandidate(normalizedQuery, tokens, candidate.text)
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.text.localeCompare(right.text);
    });
}

function scoreCandidate(
  normalizedQuery: string,
  tokens: string[],
  text: string
) {
  const normalizedText = normalizeSearchQuery(text);
  if (!normalizedText) {
    return 0;
  }

  if (normalizedText === normalizedQuery) {
    return 1000;
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return 800 - normalizedText.length;
  }

  if (tokens.every((token) => normalizedText.includes(token))) {
    return 600 - normalizedText.length;
  }

  if (normalizedText.includes(normalizedQuery)) {
    return 400 - normalizedText.length;
  }

  return 0;
}
