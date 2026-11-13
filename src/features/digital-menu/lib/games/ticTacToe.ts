export type Player = "X" | "O";
export type BoardCell = Player | null;

export const WINNING_LINES: readonly [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export interface TicTacToeState {
  board: BoardCell[];
  turn: Player;
  winner: Player | null;
  winningLine: [number, number, number] | null;
  isDraw: boolean;
  isGameOver: boolean;
}

/**
 * Creates an empty initial state for Tic-tac-toe.
 */
export function createTicTacToeGame(): TicTacToeState {
  return {
    board: Array(9).fill(null),
    turn: "X",
    winner: null,
    winningLine: null,
    isDraw: false,
    isGameOver: false,
  };
}

/**
 * Checks if there is a winner on the board.
 */
export function checkWinner(
  board: readonly BoardCell[]
): { winner: Player; line: [number, number, number] } | null {
  for (const [a, b, c] of WINNING_LINES) {
    const valA = board[a];
    if (valA && valA === board[b] && valA === board[c]) {
      return { winner: valA, line: [a, b, c] };
    }
  }
  return null;
}

/**
 * Checks if all cells are filled.
 */
export function isBoardFull(board: readonly BoardCell[]): boolean {
  return board.every((cell) => cell !== null);
}

/**
 * Returns all open cell indices (0..8).
 */
export function getAvailableMoves(board: readonly BoardCell[]): number[] {
  const moves: number[] = [];
  board.forEach((cell, idx) => {
    if (cell === null) moves.push(idx);
  });
  return moves;
}

/**
 * Selects the optimal CPU move:
 * 1. Takes immediate winning move.
 * 2. Blocks immediate opponent winning move.
 * 3. Chooses center if free.
 * 4. Chooses an open corner.
 * 5. Chooses any open side.
 */
export function getCpuMove(
  board: readonly BoardCell[],
  cpuPlayer: Player = "O",
  rng: () => number = Math.random
): number | null {
  const available = getAvailableMoves(board);
  if (available.length === 0) return null;

  const opponent: Player = cpuPlayer === "O" ? "X" : "O";

  // 1. Can CPU win right now?
  for (const move of available) {
    const nextBoard = [...board];
    nextBoard[move] = cpuPlayer;
    if (checkWinner(nextBoard)) {
      return move;
    }
  }

  // 2. Can opponent win right now? Block it!
  for (const move of available) {
    const nextBoard = [...board];
    nextBoard[move] = opponent;
    if (checkWinner(nextBoard)) {
      return move;
    }
  }

  // 3. Take center if available
  if (board[4] === null) {
    return 4;
  }

  // 4. Take corners [0, 2, 6, 8]
  const corners = [0, 2, 6, 8].filter((idx) => board[idx] === null);
  if (corners.length > 0) {
    const pick = Math.floor(rng() * corners.length);
    return corners[pick];
  }

  // 5. Take any remaining side [1, 3, 5, 7]
  const sides = [1, 3, 5, 7].filter((idx) => board[idx] === null);
  if (sides.length > 0) {
    const pick = Math.floor(rng() * sides.length);
    return sides[pick];
  }

  return available[0];
}

/**
 * Applies a move for player and optionally responds with the CPU move immediately.
 */
export function playTicTacToeMove(
  state: TicTacToeState,
  index: number,
  withCpu: boolean = true,
  rng: () => number = Math.random
): TicTacToeState {
  if (state.isGameOver || index < 0 || index >= 9 || state.board[index] !== null) {
    return state;
  }

  const nextBoard = [...state.board];
  nextBoard[index] = state.turn;

  const winInfo = checkWinner(nextBoard);
  if (winInfo) {
    return {
      board: nextBoard,
      turn: state.turn === "X" ? "O" : "X",
      winner: winInfo.winner,
      winningLine: winInfo.line,
      isDraw: false,
      isGameOver: true,
    };
  }

  if (isBoardFull(nextBoard)) {
    return {
      board: nextBoard,
      turn: state.turn === "X" ? "O" : "X",
      winner: null,
      winningLine: null,
      isDraw: true,
      isGameOver: true,
    };
  }

  if (!withCpu) {
    return {
      board: nextBoard,
      turn: state.turn === "X" ? "O" : "X",
      winner: null,
      winningLine: null,
      isDraw: false,
      isGameOver: false,
    };
  }

  // CPU responds
  const cpuTurn: Player = state.turn === "X" ? "O" : "X";
  const cpuMove = getCpuMove(nextBoard, cpuTurn, rng);

  if (cpuMove === null) {
    return {
      board: nextBoard,
      turn: cpuTurn,
      winner: null,
      winningLine: null,
      isDraw: isBoardFull(nextBoard),
      isGameOver: isBoardFull(nextBoard),
    };
  }

  const afterCpuBoard = [...nextBoard];
  afterCpuBoard[cpuMove] = cpuTurn;

  const cpuWin = checkWinner(afterCpuBoard);
  if (cpuWin) {
    return {
      board: afterCpuBoard,
      turn: state.turn,
      winner: cpuWin.winner,
      winningLine: cpuWin.line,
      isDraw: false,
      isGameOver: true,
    };
  }

  const isFullAfterCpu = isBoardFull(afterCpuBoard);
  return {
    board: afterCpuBoard,
    turn: state.turn,
    winner: null,
    winningLine: null,
    isDraw: isFullAfterCpu,
    isGameOver: isFullAfterCpu,
  };
}
