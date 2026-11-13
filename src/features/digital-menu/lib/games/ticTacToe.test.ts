import { describe, expect, it } from "vitest";
import {
  checkWinner,
  createTicTacToeGame,
  getCpuMove,
  isBoardFull,
  playTicTacToeMove,
  WINNING_LINES,
  type BoardCell,
} from "./ticTacToe";

describe("tic-tac-toe game logic", () => {
  it("detects all winning lines for X and O", () => {
    for (const [a, b, c] of WINNING_LINES) {
      const boardX: BoardCell[] = Array(9).fill(null);
      boardX[a] = "X";
      boardX[b] = "X";
      boardX[c] = "X";

      const winX = checkWinner(boardX);
      expect(winX).not.toBeNull();
      expect(winX?.winner).toBe("X");
      expect(winX?.line).toEqual([a, b, c]);

      const boardO: BoardCell[] = Array(9).fill(null);
      boardO[a] = "O";
      boardO[b] = "O";
      boardO[c] = "O";

      const winO = checkWinner(boardO);
      expect(winO).not.toBeNull();
      expect(winO?.winner).toBe("O");
    }
  });

  it("detects draw when board is full and no winner", () => {
    // X O X
    // X O O
    // O X X
    const board: BoardCell[] = [
      "X", "O", "X",
      "X", "O", "O",
      "O", "X", "X",
    ];

    expect(isBoardFull(board)).toBe(true);
    expect(checkWinner(board)).toBeNull();
  });

  it("CPU takes winning move immediately when available", () => {
    // Board where O has 0, 1 and can win at 2
    // O O _
    // X X _
    // _ _ _
    const board: BoardCell[] = [
      "O", "O", null,
      "X", "X", null,
      null, null, null,
    ];

    const move = getCpuMove(board, "O");
    expect(move).toBe(2);
  });

  it("CPU blocks opponent's winning move when opponent has 2 in a line", () => {
    // Board where X has 0, 1 and threatens 2; O has 4
    // X X _
    // _ O _
    // _ _ _
    const board: BoardCell[] = [
      "X", "X", null,
      null, "O", null,
      null, null, null,
    ];

    const move = getCpuMove(board, "O");
    expect(move).toBe(2);
  });

  it("CPU takes diagonal block when opponent threatens diagonal win", () => {
    // X _ _
    // _ X _
    // _ _ _
    // O must block at 8
    const board: BoardCell[] = [
      "X", null, null,
      null, "X", null,
      null, null, null,
    ];

    const move = getCpuMove(board, "O");
    expect(move).toBe(8);
  });

  it("plays a full round against CPU", () => {
    let state = createTicTacToeGame();
    expect(state.board.every((c) => c === null)).toBe(true);
    expect(state.isGameOver).toBe(false);

    // Player moves at corner 0
    state = playTicTacToeMove(state, 0, true, () => 0);
    expect(state.board[0]).toBe("X");
    // CPU should take center 4
    expect(state.board[4]).toBe("O");
    expect(state.isGameOver).toBe(false);
  });

  it("prevents moves after game is over", () => {
    let state = createTicTacToeGame();
    // Force a won state
    state.isGameOver = true;
    state.winner = "X";

    const nextState = playTicTacToeMove(state, 0);
    expect(nextState).toEqual(state);
  });
});
