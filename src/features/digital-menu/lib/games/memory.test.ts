import { describe, expect, it } from "vitest";
import {
  createMemoryGame,
  flipMemoryCard,
  resolveMismatches,
  shuffleArray,
} from "./memory";

describe("memory game logic", () => {
  it("shuffles pairs deterministically with custom RNG", () => {
    // Constant RNG returning 0 reverses or shifts deterministically
    const mockRng = () => 0;
    const items = [1, 2, 3, 4];
    const shuffled = shuffleArray(items, mockRng);
    expect(shuffled).toHaveLength(4);
    expect(shuffled.sort()).toEqual([1, 2, 3, 4]);
  });

  it("creates initial state with pairs for all symbols", () => {
    const symbols = ["🍕", "🍔"];
    const game = createMemoryGame(symbols, () => 0.5);

    expect(game.cards).toHaveLength(4);
    expect(game.moves).toBe(0);
    expect(game.matchesCount).toBe(0);
    expect(game.totalPairs).toBe(2);
    expect(game.isWon).toBe(false);
    expect(game.cards.every((c) => !c.isFlipped && !c.isMatched)).toBe(true);

    const counts = game.cards.reduce<Record<string, number>>((acc, card) => {
      acc[card.symbol] = (acc[card.symbol] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts["🍕"]).toBe(2);
    expect(counts["🍔"]).toBe(2);
  });

  it("flips the first card without incrementing moves", () => {
    const game = createMemoryGame(["🍕", "🍔"], () => 0.5);
    const next = flipMemoryCard(game, 0);

    expect(next.cards[0].isFlipped).toBe(true);
    expect(next.selectedCardIds).toEqual([0]);
    expect(next.moves).toBe(0);
  });

  it("ignores click on already flipped or matched cards", () => {
    const game = createMemoryGame(["🍕", "🍔"], () => 0.5);
    const flipped = flipMemoryCard(game, 0);
    const again = flipMemoryCard(flipped, 0);

    expect(again).toEqual(flipped);
  });

  it("handles a matched pair correctly and checks win condition", () => {
    // Use identity RNG so card 0 and card 1 are pair 0
    // Actually, create game with predictable symbols
    const game = createMemoryGame(["🍕", "🍔"]);
    // Find two cards with the same pairId
    const pairId = game.cards[0].pairId;
    const secondCardIndex = game.cards.findIndex((c, idx) => idx !== 0 && c.pairId === pairId);

    const afterFirst = flipMemoryCard(game, 0);
    const afterSecond = flipMemoryCard(afterFirst, secondCardIndex);

    expect(afterSecond.moves).toBe(1);
    expect(afterSecond.matchesCount).toBe(1);
    expect(afterSecond.selectedCardIds).toEqual([]);
    expect(afterSecond.cards[0].isMatched).toBe(true);
    expect(afterSecond.cards[secondCardIndex].isMatched).toBe(true);
    expect(afterSecond.isWon).toBe(false);

    // Find the other pair
    const remainingIndices = game.cards
      .map((c, i) => (c.pairId !== pairId ? i : -1))
      .filter((i) => i !== -1);
    const win1 = flipMemoryCard(afterSecond, remainingIndices[0]);
    const win2 = flipMemoryCard(win1, remainingIndices[1]);

    expect(win2.moves).toBe(2);
    expect(win2.matchesCount).toBe(2);
    expect(win2.isWon).toBe(true);
  });

  it("handles mismatch and resolveMismatches", () => {
    const game = createMemoryGame(["🍕", "🍔"]);
    // Find two cards with different pairId
    const card0 = game.cards[0];
    const diffIndex = game.cards.findIndex((c) => c.pairId !== card0.pairId);

    const step1 = flipMemoryCard(game, 0);
    const step2 = flipMemoryCard(step1, diffIndex);

    expect(step2.moves).toBe(1);
    expect(step2.matchesCount).toBe(0);
    expect(step2.selectedCardIds).toEqual([0, diffIndex]);
    expect(step2.cards[0].isFlipped).toBe(true);
    expect(step2.cards[diffIndex].isFlipped).toBe(true);
    expect(step2.cards[0].isMatched).toBe(false);

    const resolved = resolveMismatches(step2);
    expect(resolved.selectedCardIds).toEqual([]);
    expect(resolved.cards[0].isFlipped).toBe(false);
    expect(resolved.cards[diffIndex].isFlipped).toBe(false);
  });

  it("auto-resolves previous mismatch when user clicks a 3rd card", () => {
    const game = createMemoryGame(["🍕", "🍔", "🌮"]);
    const card0 = game.cards[0];
    const diffIndex = game.cards.findIndex((c) => c.pairId !== card0.pairId);
    const thirdIndex = game.cards.findIndex(
      (_, idx) => idx !== 0 && idx !== diffIndex
    );

    const step1 = flipMemoryCard(game, 0);
    const step2 = flipMemoryCard(step1, diffIndex);
    // User clicks a third card without waiting for timeout
    const step3 = flipMemoryCard(step2, thirdIndex);

    expect(step3.cards[0].isFlipped).toBe(false);
    expect(step3.cards[diffIndex].isFlipped).toBe(false);
    expect(step3.cards[thirdIndex].isFlipped).toBe(true);
    expect(step3.selectedCardIds).toEqual([thirdIndex]);
  });
});
