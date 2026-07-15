// Fractional indexing helpers (HANDOFF D8). Used for board columns, backlog, page tree.
import { generateKeyBetween } from "fractional-indexing";

/** Rank for appending at the end of a list. */
export function rankAfter(lastRank: string | null): string {
  return generateKeyBetween(lastRank, null);
}

/** Rank between two neighbors (either side may be null = start/end of list). */
export function rankBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** Generate n sequential ranks for bulk inserts (e.g. seeding). */
export function rankSequence(n: number): string[] {
  const ranks: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = generateKeyBetween(prev, null);
    ranks.push(prev);
  }
  return ranks;
}
