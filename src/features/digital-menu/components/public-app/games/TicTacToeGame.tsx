import { useState } from "react";
import { ArrowLeft, RotateCcw, Trophy, User, Bot } from "lucide-react";
import {
  createTicTacToeGame,
  playTicTacToeMove,
  type TicTacToeState,
} from "../../../lib/games/ticTacToe";

export interface TicTacToeGameProps {
  onBack: () => void;
}

export function TicTacToeGame({ onBack }: TicTacToeGameProps) {
  const [state, setState] = useState<TicTacToeState>(() => createTicTacToeGame());
  const [scores, setScores] = useState({ wins: 0, losses: 0, draws: 0 });

  const handleCellClick = (index: number) => {
    if (state.isGameOver || state.board[index] !== null) return;

    const nextState = playTicTacToeMove(state, index, true);
    setState(nextState);

    if (nextState.isGameOver) {
      if (nextState.winner === "X") {
        setScores((prev) => ({ ...prev, wins: prev.wins + 1 }));
      } else if (nextState.winner === "O") {
        setScores((prev) => ({ ...prev, losses: prev.losses + 1 }));
      } else if (nextState.isDraw) {
        setScores((prev) => ({ ...prev, draws: prev.draws + 1 }));
      }
    }
  };

  const handleReset = () => {
    setState(createTicTacToeGame());
  };

  const getStatusText = () => {
    if (state.winner === "X") return "¡Ganaste!";
    if (state.winner === "O") return "Ganó la máquina";
    if (state.isDraw) return "¡Empate!";
    return "Tu turno (X)";
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto space-y-4">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a la lista de juegos"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-xs font-semibold text-zinc-300 hover:text-white hover:border-zinc-700 transition cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          <span>Volver</span>
        </button>

        {/* Score Counter */}
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold">
            <User className="size-3" />
            <span>{scores.wins}</span>
          </div>
          <span className="text-zinc-600">·</span>
          <div className="text-zinc-400 font-medium">
            <span>{scores.draws}</span>
          </div>
          <span className="text-zinc-600">·</span>
          <div className="flex items-center gap-1 text-amber-400 font-semibold">
            <Bot className="size-3" />
            <span>{scores.losses}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          aria-label="Reiniciar partida de tres en raya"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-xs font-semibold text-zinc-400 hover:text-white hover:border-zinc-700 transition cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reiniciar</span>
        </button>
      </div>

      {/* Screen-reader Live Status */}
      <div className="sr-only" aria-live="polite" role="status">
        {getStatusText()}
      </div>

      {/* Game State Banner */}
      <div
        className={`flex items-center justify-between w-full p-2.5 rounded-xl border text-xs font-medium ${
          state.winner === "X"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            : state.winner === "O"
            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
            : state.isDraw
            ? "bg-zinc-800/40 border-zinc-700 text-zinc-300"
            : "bg-[#18181b] border-[#27272a] text-zinc-300"
        }`}
      >
        <div className="flex items-center gap-2">
          {state.winner === "X" && <Trophy className="size-4 text-emerald-400" />}
          <span className="font-semibold">{getStatusText()}</span>
        </div>

        {state.isGameOver ? (
          <button
            type="button"
            onClick={handleReset}
            className="px-2.5 py-1 rounded-lg bg-white text-zinc-950 font-bold text-[11px] hover:bg-zinc-100 transition cursor-pointer"
          >
            Nueva partida
          </button>
        ) : (
          <span className="text-[11px] text-zinc-400">Jugador (X) vs CPU (O)</span>
        )}
      </div>

      {/* 3x3 Board */}
      <div
        role="grid"
        aria-label="Tablero de tres en raya"
        className="grid grid-cols-3 gap-2.5 w-full aspect-square max-w-[300px] p-2.5 rounded-2xl bg-[#09090b] border border-[#27272a]"
      >
        {state.board.map((cell, index) => {
          const isWinningCell = state.winningLine?.includes(index as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8);
          const row = Math.floor(index / 3) + 1;
          const col = (index % 3) + 1;

          return (
            <button
              key={index}
              type="button"
              onClick={() => handleCellClick(index)}
              disabled={state.isGameOver || cell !== null}
              aria-label={`Casilla fila ${row}, columna ${col}: ${cell ? `marcada con ${cell}` : "vacía"}`}
              className={`flex items-center justify-center rounded-xl text-3xl sm:text-4xl font-black transition-all select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                isWinningCell
                  ? "bg-emerald-400/20 border-2 border-emerald-400 text-emerald-300 shadow-lg scale-102"
                  : cell === "X"
                  ? "bg-[#18181b] border border-zinc-700 text-emerald-400"
                  : cell === "O"
                  ? "bg-[#18181b] border border-zinc-700 text-amber-400"
                  : "bg-[#18181b] border border-[#27272a] text-transparent hover:border-zinc-600 hover:bg-[#202024] active:scale-95"
              }`}
            >
              {cell ?? ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TicTacToeGame;
