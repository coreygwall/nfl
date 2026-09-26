import { describe, expect, it } from "vitest";
import { placeMoves } from "../../src/lib/placeMoves.ts";

const row = (playerId: string, place: number) => ({ playerId, place });

describe("placeMoves", () => {
  it("counts up the table as positive and down as negative", () => {
    const before = [row("a", 1), row("b", 2), row("c", 3)];
    const after = [row("c", 1), row("a", 2), row("b", 3)];
    expect(placeMoves(before, after)).toEqual({ c: 2, a: -1, b: -1 });
  });

  it("says nothing about anybody who stayed put", () => {
    const board = [row("a", 1), row("b", 2)];
    expect(placeMoves(board, board)).toEqual({});
  });

  it("gives somebody new no before and somebody gone no after", () => {
    expect(placeMoves([row("a", 1), row("gone", 2)], [row("new", 1), row("a", 2)])).toEqual({ a: -1 });
  });

  it("does not call a shared place a move", () => {
    expect(placeMoves([row("a", 1), row("b", 2), row("c", 2)], [row("a", 1), row("c", 2), row("b", 2)])).toEqual({});
  });
});
