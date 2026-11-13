export type Direction2048 = "UP" | "DOWN" | "LEFT" | "RIGHT";
export type Grid2048 = number[][];

export interface Game2048State {
  grid: Grid2048;
  score: number;
  bestScore: number;
  isWon: boolean;
  isGameOver: boolean;
}

export const GRID_SIZE = 4;

/**
 * Creates an empty 4x4 grid of zeros.
 */
export function createEmptyGrid(size: number = GRID_SIZE): Grid2048 {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

/**
 * Pure row slider & merger according to standard 2048 rules:
 * - Slides tiles towards the left
 * - Merges matching adjacent numbers once per move
 * - Pads trailing positions with zeros
 */
export function slideRow(row: readonly number[]): {
  row: number[];
  scoreGained: number;
  changed: boolean;
} {
  const nonZeros = row.filter((val) => val !== 0);
  const result: number[] = [];
  let scoreGained = 0;
  let i = 0;

  while (i < nonZeros.length) {
    if (i + 1 < nonZeros.length && nonZeros[i] === nonZeros[i + 1]) {
      const mergedVal = nonZeros[i] * 2;
      result.push(mergedVal);
      scoreGained += mergedVal;
      i += 2; // Each tile can merge at most once per move
    } else {
      result.push(nonZeros[i]);
      i += 1;
    }
  }

  while (result.length < row.length) {
    result.push(0);
  }

  const changed = result.some((val, idx) => val !== row[idx]);

  return { row: result, scoreGained, changed };
}

/**
 * Transposes an NxN matrix (rows become columns).
 */
export function transpose(grid: readonly Grid2048[number][]): Grid2048 {
  const size = grid.length;
  const result = createEmptyGrid(size);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      result[c][r] = grid[r][c];
    }
  }
  return result;
}

/**
 * Slides and merges the entire grid in one of four directions.
 */
export function slideGrid(
  grid: readonly Grid2048[number][],
  direction: Direction2048
): {
  grid: Grid2048;
  scoreGained: number;
  changed: boolean;
} {
  let workingGrid: Grid2048;

  if (direction === "LEFT") {
    workingGrid = grid.map((r) => [...r]);
  } else if (direction === "RIGHT") {
    workingGrid = grid.map((r) => [...r].reverse());
  } else if (direction === "UP") {
    workingGrid = transpose(grid);
  } else {
    // DOWN
    workingGrid = transpose(grid).map((r) => [...r].reverse());
  }

  let totalScoreGained = 0;
  let anyChanged = false;

  const slidRows = workingGrid.map((r) => {
    const { row, scoreGained, changed } = slideRow(r);
    totalScoreGained += scoreGained;
    if (changed) anyChanged = true;
    return row;
  });

  let finalGrid: Grid2048;

  if (direction === "LEFT") {
    finalGrid = slidRows;
  } else if (direction === "RIGHT") {
    finalGrid = slidRows.map((r) => [...r].reverse());
  } else if (direction === "UP") {
    finalGrid = transpose(slidRows);
  } else {
    // DOWN
    const reversedBack = slidRows.map((r) => [...r].reverse());
    finalGrid = transpose(reversedBack);
  }

  return {
    grid: finalGrid,
    scoreGained: totalScoreGained,
    changed: anyChanged,
  };
}

/**
 * Finds all empty cells in the grid.
 */
export function getEmptyCells(grid: readonly Grid2048[number][]): Array<{ r: number; c: number }> {
  const empty: Array<{ r: number; c: number }> = [];
  grid.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val === 0) empty.push({ r, c });
    });
  });
  return empty;
}

/**
 * Spawns a new tile (2 with 90% probability, 4 with 10%) into an empty cell.
 */
export function spawnRandomTile(
  grid: readonly Grid2048[number][],
  rng: () => number = Math.random
): {
  grid: Grid2048;
  spawned: { r: number; c: number; value: number } | null;
} {
  const empty = getEmptyCells(grid);
  if (empty.length === 0) {
    return { grid: grid.map((r) => [...r]), spawned: null };
  }

  const pickIndex = Math.floor(rng() * empty.length);
  const target = empty[pickIndex];
  const value = rng() < 0.9 ? 2 : 4;

  const nextGrid = grid.map((row, r) =>
    row.map((val, c) => (r === target.r && c === target.c ? value : val))
  );

  return {
    grid: nextGrid,
    spawned: { r: target.r, c: target.c, value },
  };
}

/**
 * Checks if 2048 has been achieved anywhere on the board.
 */
export function hasWon2048(grid: readonly Grid2048[number][]): boolean {
  return grid.some((row) => row.some((val) => val >= 2048));
}

/**
 * Checks if no valid moves remain (no zero cells and no adjacent equal tiles).
 */
export function isGameOver2048(grid: readonly Grid2048[number][]): boolean {
  const size = grid.length;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = grid[r][c];
      if (val === 0) return false;
      // Check right neighbor
      if (c + 1 < size && val === grid[r][c + 1]) return false;
      // Check down neighbor
      if (r + 1 < size && val === grid[r + 1][c]) return false;
    }
  }

  return true;
}

/**
 * Initializes a new 2048 game state with two spawned tiles.
 */
export function create2048Game(
  rng: () => number = Math.random,
  bestScore: number = 0
): Game2048State {
  const empty = createEmptyGrid();
  const first = spawnRandomTile(empty, rng);
  const second = spawnRandomTile(first.grid, rng);

  return {
    grid: second.grid,
    score: 0,
    bestScore,
    isWon: hasWon2048(second.grid),
    isGameOver: isGameOver2048(second.grid),
  };
}

/**
 * Advances the game by one move in the requested direction.
 */
export function move2048(
  state: Game2048State,
  direction: Direction2048,
  rng: () => number = Math.random
): Game2048State {
  if (state.isGameOver) {
    return state;
  }

  const { grid: slid, scoreGained, changed } = slideGrid(state.grid, direction);

  if (!changed) {
    return state;
  }

  const { grid: nextGrid } = spawnRandomTile(slid, rng);
  const nextScore = state.score + scoreGained;
  const nextBestScore = Math.max(state.bestScore, nextScore);
  const isWon = hasWon2048(nextGrid);
  const isGameOver = isGameOver2048(nextGrid);

  return {
    grid: nextGrid,
    score: nextScore,
    bestScore: nextBestScore,
    isWon,
    isGameOver,
  };
}
