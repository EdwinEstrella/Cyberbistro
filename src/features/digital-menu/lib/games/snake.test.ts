import { describe, expect, it } from "vitest";
import {
  changeSnakeDirection,
  createSnakeGame,
  generateFoodPosition,
  isOppositeDirection,
  isWallCollision,
  stepSnakeGame,
  type Point,
} from "./snake";

describe("snake game logic", () => {
  it("detects opposite directions correctly", () => {
    expect(isOppositeDirection("UP", "DOWN")).toBe(true);
    expect(isOppositeDirection("DOWN", "UP")).toBe(true);
    expect(isOppositeDirection("LEFT", "RIGHT")).toBe(true);
    expect(isOppositeDirection("RIGHT", "LEFT")).toBe(true);

    expect(isOppositeDirection("UP", "LEFT")).toBe(false);
    expect(isOppositeDirection("UP", "RIGHT")).toBe(false);
    expect(isOppositeDirection("DOWN", "LEFT")).toBe(false);
    expect(isOppositeDirection("DOWN", "RIGHT")).toBe(false);
  });

  it("advances snake one step in current direction", () => {
    const game = {
      ...createSnakeGame({ width: 10, height: 10 }),
      food: { x: 0, y: 0 },
    };
    const initialHead = game.snake[0];

    const next = stepSnakeGame(game);
    expect(next.snake[0]).toEqual({ x: initialHead.x + 1, y: initialHead.y });
    expect(next.snake).toHaveLength(game.snake.length);
    expect(next.isGameOver).toBe(false);
  });

  it("prevents immediate 180° reversal", () => {
    const game = createSnakeGame({ width: 10, height: 10 });
    // Moving RIGHT initially, try to turn LEFT
    const attempted = changeSnakeDirection(game, "LEFT");
    expect(attempted.nextDirection).toBe("RIGHT");

    // But turning UP or DOWN is allowed
    const validTurn = changeSnakeDirection(game, "UP");
    expect(validTurn.nextDirection).toBe("UP");
  });

  it("grows snake and increases score when food is consumed", () => {
    const game = createSnakeGame({ width: 10, height: 10 });
    const nextHeadX = game.snake[0].x + 1;
    const nextHeadY = game.snake[0].y;

    // Place food directly in front of head
    const gameWithFood = {
      ...game,
      food: { x: nextHeadX, y: nextHeadY },
    };

    const next = stepSnakeGame(gameWithFood, () => 0.5);
    expect(next.snake).toHaveLength(game.snake.length + 1);
    expect(next.score).toBe(10);
    expect(next.snake[0]).toEqual({ x: nextHeadX, y: nextHeadY });
    // Food must have respawned away from snake
    expect(next.snake.some((seg) => seg.x === next.food.x && seg.y === next.food.y)).toBe(false);
  });

  it("never generates food on top of the snake", () => {
    const width = 3;
    const height = 3;
    const snake: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
    ];
    // Only (2, 2) is free!
    const food = generateFoodPosition(snake, width, height, () => 0.99);
    expect(food).toEqual({ x: 2, y: 2 });
  });

  it("triggers game over on wall collision", () => {
    // Snake at top-right boundary moving RIGHT
    const game = createSnakeGame({ width: 5, height: 5 });
    const atWall = {
      ...game,
      snake: [
        { x: 4, y: 0 },
        { x: 3, y: 0 },
        { x: 2, y: 0 },
      ],
      direction: "RIGHT" as const,
      nextDirection: "RIGHT" as const,
    };

    const after = stepSnakeGame(atWall);
    expect(after.isGameOver).toBe(true);
    expect(isWallCollision({ x: 5, y: 0 }, 5, 5)).toBe(true);
  });

  it("triggers game over on self collision", () => {
    // Snake coiled in a loop
    // (1,1) -> (1,2) -> (2,2) -> (2,1) -> (2,0)
    // Next move DOWN from (1,1) hits (1,2)
    const coiled = {
      ...createSnakeGame({ width: 10, height: 10 }),
      snake: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
        { x: 0, y: 2 },
      ],
      direction: "DOWN" as const,
      nextDirection: "DOWN" as const,
      food: { x: 9, y: 9 }, // not eating
    };

    const after = stepSnakeGame(coiled);
    expect(after.isGameOver).toBe(true);
  });
});
