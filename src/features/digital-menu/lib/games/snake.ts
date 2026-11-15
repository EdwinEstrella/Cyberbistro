export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

export interface Point {
  x: number;
  y: number;
}

export interface SnakeGameState {
  snake: Point[]; // index 0 is head
  direction: Direction;
  nextDirection: Direction;
  food: Point;
  score: number;
  isGameOver: boolean;
  isWon: boolean;
  gridWidth: number;
  gridHeight: number;
}

export const DEFAULT_GRID_WIDTH = 15;
export const DEFAULT_GRID_HEIGHT = 15;

/**
 * Checks if two directions are exact opposites (180 degree reverse).
 */
export function isOppositeDirection(a: Direction, b: Direction): boolean {
  return (
    (a === "UP" && b === "DOWN") ||
    (a === "DOWN" && b === "UP") ||
    (a === "LEFT" && b === "RIGHT") ||
    (a === "RIGHT" && b === "LEFT")
  );
}

/**
 * Checks if a point falls outside grid bounds.
 */
export function isWallCollision(point: Point, width: number, height: number): boolean {
  return point.x < 0 || point.x >= width || point.y < 0 || point.y >= height;
}

/**
 * Checks if a point collides with any segment in a list of points.
 */
export function isPointInSegments(point: Point, segments: readonly Point[]): boolean {
  return segments.some((seg) => seg.x === point.x && seg.y === point.y);
}

/**
 * Generates a food position guaranteed not to overlap the snake.
 * Returns null if grid is completely filled by the snake.
 */
export function generateFoodPosition(
  snake: readonly Point[],
  width: number = DEFAULT_GRID_WIDTH,
  height: number = DEFAULT_GRID_HEIGHT,
  rng: () => number = Math.random
): Point | null {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`));
  const freePositions: Point[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!occupied.has(`${x},${y}`)) {
        freePositions.push({ x, y });
      }
    }
  }

  if (freePositions.length === 0) {
    return null;
  }

  const index = Math.floor(rng() * freePositions.length);
  return freePositions[index];
}

/**
 * Calculates next head position given current position and direction.
 */
export function getNextHeadPosition(head: Point, direction: Direction): Point {
  switch (direction) {
    case "UP":
      return { x: head.x, y: head.y - 1 };
    case "DOWN":
      return { x: head.x, y: head.y + 1 };
    case "LEFT":
      return { x: head.x - 1, y: head.y };
    case "RIGHT":
      return { x: head.x + 1, y: head.y };
  }
}

/**
 * Initializes a new snake game state.
 */
export function createSnakeGame(options?: {
  width?: number;
  height?: number;
  rng?: () => number;
}): SnakeGameState {
  const gridWidth = options?.width ?? DEFAULT_GRID_WIDTH;
  const gridHeight = options?.height ?? DEFAULT_GRID_HEIGHT;
  const rng = options?.rng ?? Math.random;

  const startX = Math.floor(gridWidth / 2);
  const startY = Math.floor(gridHeight / 2);

  // Snake starts with 3 segments moving RIGHT
  const snake: Point[] = [
    { x: startX, y: startY },
    { x: startX - 1, y: startY },
    { x: startX - 2, y: startY },
  ];

  const food = generateFoodPosition(snake, gridWidth, gridHeight, rng) ?? {
    x: 0,
    y: 0,
  };

  return {
    snake,
    direction: "RIGHT",
    nextDirection: "RIGHT",
    food,
    score: 0,
    isGameOver: false,
    isWon: false,
    gridWidth,
    gridHeight,
  };
}

/**
 * Enqueues a new direction if it is not an immediate 180° reversal.
 */
export function changeSnakeDirection(
  state: SnakeGameState,
  newDir: Direction
): SnakeGameState {
  if (state.isGameOver || isOppositeDirection(state.direction, newDir)) {
    return state;
  }
  return {
    ...state,
    nextDirection: newDir,
  };
}

/**
 * Advances the snake game by one tick.
 */
export function stepSnakeGame(
  state: SnakeGameState,
  rng: () => number = Math.random
): SnakeGameState {
  if (state.isGameOver || state.isWon) {
    return state;
  }

  const activeDirection = state.nextDirection;
  const head = state.snake[0];
  const newHead = getNextHeadPosition(head, activeDirection);

  // 1. Wall collision
  if (isWallCollision(newHead, state.gridWidth, state.gridHeight)) {
    return {
      ...state,
      direction: activeDirection,
      isGameOver: true,
    };
  }

  // 2. Check food consumption
  const isEating = newHead.x === state.food.x && newHead.y === state.food.y;

  // 3. Self collision check:
  // If eating, tail is kept, so check against entire snake.
  // If not eating, tail moves away, so check against snake excluding last segment.
  const collisionBody = isEating ? state.snake : state.snake.slice(0, -1);
  if (isPointInSegments(newHead, collisionBody)) {
    return {
      ...state,
      direction: activeDirection,
      isGameOver: true,
    };
  }

  if (isEating) {
    const nextSnake = [newHead, ...state.snake];
    const nextFood = generateFoodPosition(
      nextSnake,
      state.gridWidth,
      state.gridHeight,
      rng
    );
    const isWon = nextFood === null;

    return {
      ...state,
      snake: nextSnake,
      direction: activeDirection,
      food: nextFood ?? state.food,
      score: state.score + 10,
      isWon,
      isGameOver: isWon,
    };
  }

  // Normal advance (tail popped)
  const nextSnake = [newHead, ...state.snake.slice(0, -1)];
  return {
    ...state,
    snake: nextSnake,
    direction: activeDirection,
  };
}
