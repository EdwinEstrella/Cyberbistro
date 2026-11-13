import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  RotateCcw,
  Trophy,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  create2048Game,
  move2048,
  type Direction2048,
  type Game2048State,
} from "../../../lib/games/game2048";
import { shouldHandleGameKey, GAME_2048_KEYS } from "../../../lib/games/keyboard";

export interface Game2048Props {
  onBack: () => void;
}

function getTileStyles(val: number): string {
  switch (val) {
    case 0:
      return "bg-[#18181b] border border-[#27272a] text-transparent";
    case 2:
      return "bg-zinc-800 text-zinc-100 border border-zinc-700 font-bold";
    case 4:
      return "bg-zinc-700 text-white border border-zinc-600 font-bold";
    case 8:
      return "bg-emerald-950/80 text-emerald-200 border border-emerald-800 font-bold";
    case 16:
      return "bg-emerald-900 text-emerald-100 border border-emerald-700 font-bold";
    case 32:
      return "bg-emerald-800 text-white border border-emerald-600 font-extrabold";
    case 64:
      return "bg-emerald-700 text-white border border-emerald-500 font-extrabold shadow-sm";
    case 128:
      return "bg-emerald-600 text-white font-black text-xl shadow-md";
    case 256:
      return "bg-teal-600 text-white font-black text-xl shadow-md";
    case 512:
      return "bg-cyan-600 text-white font-black text-xl shadow-lg";
    case 1024:
      return "bg-sky-600 text-white font-black text-lg shadow-lg";
    case 2048:
      return "bg-amber-400 text-zinc-950 font-black text-lg shadow-xl ring-2 ring-amber-300";
    default:
      return "bg-purple-600 text-white font-black text-lg shadow-xl";
  }
}

export function Game2048({ onBack }: Game2048Props) {
  const [state, setState] = useState<Game2048State>(() => create2048Game());
  const [keepPlayingAfterWin, setKeepPlayingAfterWin] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleMove = useCallback((dir: Direction2048) => {
    setState((prev) => move2048(prev, dir));
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleGameKey(e, GAME_2048_KEYS)) return;

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          handleMove("UP");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          handleMove("DOWN");
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          handleMove("LEFT");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          handleMove("RIGHT");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleMove]);

  // Touch Swipe Handling on the board
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const minDistance = 24;

    if (Math.max(absX, absY) < minDistance) return;

    if (absX > absY) {
      handleMove(dx > 0 ? "RIGHT" : "LEFT");
    } else {
      handleMove(dy > 0 ? "DOWN" : "UP");
    }
  };

  const handleReset = () => {
    setState(create2048Game(Math.random, state.bestScore));
    setKeepPlayingAfterWin(false);
  };

  const showWinBanner = state.isWon && !keepPlayingAfterWin;

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto space-y-3">
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

        <div className="flex items-center gap-3 text-xs font-medium">
          <span className="text-zinc-400">
            Puntos: <strong className="text-white">{state.score}</strong>
          </span>
          <span className="text-zinc-400">
            Mejor: <strong className="text-emerald-400">{state.bestScore}</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={handleReset}
          aria-label="Reiniciar juego 2048"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18181b] border border-[#27272a] text-xs font-semibold text-zinc-400 hover:text-white hover:border-zinc-700 transition cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reiniciar</span>
        </button>
      </div>

      {/* Screen-reader Live Status */}
      <div className="sr-only" aria-live="polite" role="status">
        {state.isGameOver
          ? `Fin del juego. Puntuación final: ${state.score}.`
          : state.isWon
          ? `¡Felicidades, alcanzaste el bloque 2048! Puntuación: ${state.score}.`
          : `Puntuación: ${state.score}. Mejor: ${state.bestScore}.`}
      </div>

      {/* Win Banner */}
      {showWinBanner && (
        <div
          role="status"
          className="flex items-center justify-between w-full p-2.5 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-300 text-xs shadow-lg animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-amber-400 shrink-0" />
            <span>
              <strong>¡Ganaste 2048!</strong> Puntuación: {state.score}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setKeepPlayingAfterWin(true)}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 font-semibold text-[11px] hover:bg-zinc-700 transition cursor-pointer"
            >
              Continuar
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="px-2.5 py-1 rounded-lg bg-amber-400 text-zinc-950 font-bold text-[11px] hover:bg-amber-300 transition cursor-pointer"
            >
              Nuevo
            </button>
          </div>
        </div>
      )}

      {/* Game Over Banner */}
      {state.isGameOver && (
        <div
          role="status"
          className="flex items-center justify-between w-full p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs shadow-lg animate-in fade-in"
        >
          <span>
            <strong>Fin del juego.</strong> Sin movimientos posibles.
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1 rounded-lg bg-white text-zinc-950 font-bold text-[11px] hover:bg-zinc-100 transition cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* 4x4 Board with Touch Swipe */}
      <div
        role="grid"
        aria-label="Tablero 2048"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="grid grid-cols-4 gap-2 w-full aspect-square max-w-[280px] sm:max-w-[300px] p-2.5 rounded-2xl bg-[#09090b] border border-[#27272a] shadow-xl touch-none select-none"
      >
        {state.grid.map((row, r) =>
          row.map((val, c) => (
            <div
              key={`${r}-${c}`}
              className={`flex items-center justify-center rounded-xl text-xl font-bold transition-transform duration-100 select-none ${getTileStyles(
                val
              )}`}
            >
              {val > 0 ? val : ""}
            </div>
          ))
        )}
      </div>

      {/* On-screen D-Pad Controls for mobile */}
      <div
        className="flex flex-col items-center gap-1 pt-1 select-none"
        aria-label="Controles de deslizamiento"
      >
        <button
          type="button"
          onClick={() => handleMove("UP")}
          aria-label="Mover arriba"
          className="flex size-11 items-center justify-center rounded-xl bg-[#18181b] border border-[#27272a] text-zinc-200 active:scale-95 active:bg-emerald-400/20 active:border-emerald-400 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <ChevronUp className="size-6" />
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => handleMove("LEFT")}
            aria-label="Mover a la izquierda"
            className="flex size-11 items-center justify-center rounded-xl bg-[#18181b] border border-[#27272a] text-zinc-200 active:scale-95 active:bg-emerald-400/20 active:border-emerald-400 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ChevronLeft className="size-6" />
          </button>

          <div className="size-11 flex items-center justify-center rounded-xl bg-zinc-900/40 text-[10px] font-bold text-zinc-600">
            D-PAD
          </div>

          <button
            type="button"
            onClick={() => handleMove("RIGHT")}
            aria-label="Mover a la derecha"
            className="flex size-11 items-center justify-center rounded-xl bg-[#18181b] border border-[#27272a] text-zinc-200 active:scale-95 active:bg-emerald-400/20 active:border-emerald-400 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ChevronRight className="size-6" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleMove("DOWN")}
          aria-label="Mover abajo"
          className="flex size-11 items-center justify-center rounded-xl bg-[#18181b] border border-[#27272a] text-zinc-200 active:scale-95 active:bg-emerald-400/20 active:border-emerald-400 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <ChevronDown className="size-6" />
        </button>
      </div>
    </div>
  );
}

export default Game2048;
