import { describe, expect, it } from "vitest";
import {
  create2048Game,
  isGameOver2048,
  move2048,
  slideGrid,
  slideRow,
  spawnRandomTile,
  type Grid2048,
} from "./game2048";

describe("2048 game logic", () => {
  describe("slideRow", () => {
    it("slides numbers left compressing empty spaces", () => {
      const { row, scoreGained, changed } = slideRow([0, 2, 0, 4]);
      expect(row).toEqual([2, 4, 0, 0]);
      expect(scoreGained).toBe(0);
      expect(changed).toBe(true);
    });

    it("merges matching adjacent tiles and adds to score", () => {
      const { row, scoreGained, changed } = slideRow([2, 2, 0, 0]);
      expect(row).toEqual([4, 0, 0, 0]);
      expect(scoreGained).toBe(4);
      expect(changed).toBe(true);
    });

    it("enforces merge-once-per-move rule on [2, 2, 2, 2]", () => {
      // Must result in [4, 4, 0, 0], NOT [8, 0, 0, 0]
      const { row, scoreGained } = slideRow([2, 2, 2, 2]);
      expect(row).toEqual([4, 4, 0, 0]);
      expect(scoreGained).toBe(8);
    });

    it("enforces merge-once-per-move on [4, 2, 2, 0]", () => {
      const { row, scoreGained } = slideRow([4, 2, 2, 0]);
      expect(row).toEqual([4, 4, 0, 0]);
      expect(scoreGained).toBe(4);
    });

    it("reports changed = false when row cannot slide or merge", () => {
      const { row, scoreGained, changed } = slideRow([2, 4, 8, 16]);
      expect(row).toEqual([2, 4, 8, 16]);
      expect(scoreGained).toBe(0);
      expect(changed).toBe(false);
    });
  });

  describe("slideGrid in all 4 directions", () => {
    it("slides LEFT", () => {
      const grid: Grid2048 = [
        [2, 0, 0, 2],
        [0, 4, 4, 0],
        [2, 2, 2, 2],
        [0, 0, 0, 0],
      ];
      const { grid: slid, scoreGained } = slideGrid(grid, "LEFT");
      expect(slid).toEqual([
        [4, 0, 0, 0],
        [8, 0, 0, 0],
        [4, 4, 0, 0],
        [0, 0, 0, 0],
      ]);
      expect(scoreGained).toBe(4 + 8 + 8);
    });

    it("slides RIGHT", () => {
      const grid: Grid2048 = [
        [2, 0, 0, 2],
        [4, 4, 0, 0],
        [2, 2, 2, 2],
        [0, 0, 0, 0],
      ];
      const { grid: slid, scoreGained } = slideGrid(grid, "RIGHT");
      expect(slid).toEqual([
        [0, 0, 0, 4],
        [0, 0, 0, 8],
        [0, 0, 4, 4],
        [0, 0, 0, 0],
      ]);
      expect(scoreGained).toBe(4 + 8 + 8);
    });

    it("slides UP", () => {
      const grid: Grid2048 = [
        [2, 0, 2, 0],
        [0, 4, 2, 0],
        [2, 4, 2, 0],
        [0, 0, 2, 0],
      ];
      const { grid: slid, scoreGained } = slideGrid(grid, "UP");
      expect(slid).toEqual([
        [4, 8, 4, 0],
        [0, 0, 4, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ]);
      expect(scoreGained).toBe(4 + 8 + 8);
    });

    it("slides DOWN", () => {
      const grid: Grid2048 = [
        [2, 0, 2, 0],
        [0, 4, 2, 0],
        [2, 4, 2, 0],
        [0, 0, 2, 0],
      ];
      const { grid: slid, scoreGained } = slideGrid(grid, "DOWN");
      expect(slid).toEqual([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 4, 0],
        [4, 8, 4, 0],
      ]);
      expect(scoreGained).toBe(4 + 8 + 8);
    });
  });

  describe("spawnRandomTile", () => {
    it("spawns 2 or 4 in an empty cell", () => {
      const grid: Grid2048 = [
        [2, 4, 8, 16],
        [32, 64, 128, 256],
        [512, 1024, 2048, 0], // exactly one cell empty at (2, 3)
        [2, 4, 8, 16],
      ];
      const { grid: next, spawned } = spawnRandomTile(grid, () => 0.5); // < 0.9 => 2
      expect(spawned).toEqual({ r: 2, c: 3, value: 2 });
      expect(next[2][3]).toBe(2);
    });

    it("spawns 4 when rng indicates high value", () => {
      const grid: Grid2048 = [
        [2, 4, 8, 16],
        [32, 64, 128, 256],
        [512, 1024, 2048, 0],
        [2, 4, 8, 16],
      ];
      const { grid: next, spawned } = spawnRandomTile(grid, () => 0.95); // >= 0.9 => 4
      expect(spawned).toEqual({ r: 2, c: 3, value: 4 });
      expect(next[2][3]).toBe(4);
    });
  });

  describe("game over detection", () => {
    it("returns false if there are zeros", () => {
      const grid: Grid2048 = [
        [2, 4, 8, 16],
        [32, 64, 128, 256],
        [2, 4, 8, 0],
        [16, 32, 64, 128],
      ];
      expect(isGameOver2048(grid)).toBe(false);
    });

    it("returns false if adjacent horizontal equal tiles exist", () => {
      const grid: Grid2048 = [
        [2, 2, 8, 16],
        [32, 64, 128, 256],
        [2, 4, 8, 16],
        [32, 64, 128, 256],
      ];
      expect(isGameOver2048(grid)).toBe(false);
    });

    it("returns false if adjacent vertical equal tiles exist", () => {
      const grid: Grid2048 = [
        [2, 4, 8, 16],
        [2, 64, 128, 256],
        [4, 8, 16, 32],
        [64, 128, 256, 512],
      ];
      expect(isGameOver2048(grid)).toBe(false);
    });

    it("returns true when full with no possible merges", () => {
      const grid: Grid2048 = [
        [2, 4, 2, 4],
        [4, 2, 4, 2],
        [2, 4, 2, 4],
        [4, 2, 4, 2],
      ];
      expect(isGameOver2048(grid)).toBe(true);
    });
  });

  describe("move2048", () => {
    it("accumulates score and updates bestScore", () => {
      let state = create2048Game(() => 0.1);
      expect(state.score).toBe(0);

      // Force a known grid
      state = {
        ...state,
        grid: [
          [2, 2, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
      };

      const next = move2048(state, "LEFT", () => 0.5);
      expect(next.score).toBe(4);
      expect(next.bestScore).toBe(4);
      expect(next.grid[0][0]).toBe(4);
    });

    it("does not spawn new tile if move had no effect", () => {
      const state = {
        grid: [
          [2, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        score: 0,
        bestScore: 0,
        isWon: false,
        isGameOver: false,
      };

      const next = move2048(state, "LEFT");
      expect(next).toEqual(state);
    });
  });
});
