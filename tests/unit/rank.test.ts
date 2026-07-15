import { describe, expect, it } from "vitest";
import { rankAfter, rankBetween, rankSequence } from "@/lib/rank";

describe("rank (fractional indexing, D8)", () => {
  it("appends after the last rank in sort order", () => {
    const a = rankAfter(null);
    const b = rankAfter(a);
    expect(a < b).toBe(true);
  });

  it("inserts between two neighbors", () => {
    const a = rankAfter(null);
    const c = rankAfter(a);
    const b = rankBetween(a, c);
    expect(a < b && b < c).toBe(true);
  });

  it("generates a strictly increasing sequence", () => {
    const ranks = rankSequence(50);
    const sorted = [...ranks].sort();
    expect(ranks).toEqual(sorted);
    expect(new Set(ranks).size).toBe(50);
  });
});
