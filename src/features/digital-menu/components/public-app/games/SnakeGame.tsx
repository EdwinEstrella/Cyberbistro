import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft,
  RotateCcw,
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Trophy,
} from "lucide-react";
import {
  changeSnakeDirection,
  createSnakeGame,
  stepSnakeGame,
  type Direction,
  type SnakeGameState,
} from "../../../lib/games/snake";
import { fillRoundedRect } from "../../../lib/games/canvas";
import { shouldHandleGameKey } from "../../../lib/games/keyboard";
import { publicMenuTheme } from "../publicMenuTheme";

export interface SnakeGameProps {
  onBack: () => void;
}

export function SnakeGame({ onBack }: SnakeGameProps) {
  const [state, setState] = useState<SnakeGameState>(() => createSnakeGame());
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [highScore, setHighScore] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Update session high score
  useEffect(() => {
    if (state.score > highScore) {
      setHighScore(state.score);
    }
  }, [state.score, highScore]);

  // Handle Pause on tab hidden (document visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsPaused(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Tick interval cleaned on unmount
  useEffect(() => {
    if (state.isGameOver || state.isWon || isPaused) return;

    const tickMs = 150;
    const interval = setInterval(() => {
      setState((prev) => stepSnakeGame(prev));
    }, tickMs);

    return () => clearInterval(interval);
  }, [state.isGameOver, state.isWon, isPaused]);

  // Handle direction dispatch
  const handleDirection = useCallback((dir: Direction) => {
    setState((prev) => changeSnakeDirection(prev, dir));
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleGameKey(e)) return;

      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          handleDirection("UP");
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          handleDirection("DOWN");
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          handleDirection("LEFT");
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          handleDirection("RIGHT");
          break;
        case " ":
          e.preventDefault();
          setIsPaused((p) => !p);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDirection]);

  // Canvas drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const cellWidth = width / state.gridWidth;
    const cellHeight = height / state.gridHeight;

    // Clear background
    ctx.fillStyle = publicMenuTheme.colors.deep;
    ctx.fillRect(0, 0, width, height);

    // Subtle grid lines
    ctx.strokeStyle = publicMenuTheme.colors.divider;
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += cellWidth) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += cellHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw food (apple / dot)
    const foodX = state.food.x * cellWidth + cellWidth / 2;
    const foodY = state.food.y * cellHeight + cellHeight / 2;
    const foodRadius = Math.min(cellWidth, cellHeight) * 0.42;

    ctx.fillStyle = "#f43f5e"; // bright red/rose
    ctx.beginPath();
    ctx.arc(foodX, foodY, foodRadius, 0, Math.PI * 2);
    ctx.fill();

    // Food gloss dot
    ctx.fillStyle = "#fda4af";
    ctx.beginPath();
    ctx.arc(foodX - foodRadius * 0.3, foodY - foodRadius * 0.3, foodRadius * 0.25, 0, Math.PI * 2);
    ctx.fill();

    // Draw snake segments
    state.snake.forEach((seg, idx) => {
      const segX = seg.x * cellWidth;
      const segY = seg.y * cellHeight;
      const pad = 1.5;

      if (idx === 0) {
        // Head (bright coral)
        ctx.fillStyle = publicMenuTheme.colors.accentHover;
        fillRoundedRect(
          ctx,
          segX + pad,
          segY + pad,
          cellWidth - pad * 2,
          cellHeight - pad * 2,
          4
        );
      } else {
        // Body (deep coral)
        ctx.fillStyle = publicMenuTheme.colors.accent;
        fillRoundedRect(
          ctx,
          segX + pad,
          segY + pad,
          cellWidth - pad * 2,
          cellHeight - pad * 2,
          3
        );
      }
    });
  }, [state]);

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
      handleDirection(dx > 0 ? "RIGHT" : "LEFT");
    } else {
      handleDirection(dy > 0 ? "DOWN" : "UP");
    }
  };

  const handleReset = () => {
    setState(createSnakeGame());
    setIsPaused(false);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto space-y-3">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between w-full">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver a la lista de juegos"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#131313] border border-[#262626] text-xs font-semibold text-[#fafafa] hover:border-[#3a3a3a] transition cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          <span>Volver</span>
        </button>

        <div className="flex items-center gap-3 text-xs font-medium">
          <span className="text-[#adaaaa]">
            Puntos: <strong className="text-white">{state.score}</strong>
          </span>
          <span className="text-[#adaaaa]">
            Mejor: <strong className="text-[#ff906d]">{highScore}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!state.isGameOver && !state.isWon && (
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              aria-label={isPaused ? "Reanudar juego" : "Pausar juego"}
              className="flex items-center justify-center size-8 rounded-lg bg-[#131313] border border-[#262626] text-[#fafafa] hover:border-[#3a3a3a] transition cursor-pointer"
            >
              {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={handleReset}
            aria-label="Reiniciar juego de la serpiente"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#131313] border border-[#262626] text-xs font-semibold text-[#adaaaa] hover:text-[#fafafa] hover:border-[#3a3a3a] transition cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Reiniciar</span>
          </button>
        </div>
      </div>

      {/* Screen-reader Live Status */}
      <div className="sr-only" aria-live="polite" role="status">
        {state.isGameOver
          ? `Fin del juego. Puntuación: ${state.score}.`
          : state.isWon
          ? `¡Felicidades, ganaste el juego!`
          : isPaused
          ? "Juego pausado"
          : `Puntos: ${state.score}`}
      </div>

      {/* Banner when Paused or Game Over */}
      {state.isGameOver && (
        <div
          role="status"
          className="flex items-center justify-between w-full p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-in fade-in"
        >
          <span>
            <strong>Fin del juego.</strong> Puntuación: {state.score}
          </span>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1 rounded-lg bg-white text-[#0a0a0a] font-bold text-[11px] hover:bg-[#fafafa] transition cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      )}

      {state.isWon && (
        <div
          role="status"
          className="flex items-center justify-between w-full p-2.5 rounded-xl bg-[#2b160d] border border-[#5b2a17] text-[#ffb59c] text-xs animate-in fade-in"
        >
          <div className="flex items-center gap-1.5">
            <Trophy className="size-4 text-[#ff906d] shrink-0" />
            <span>
              <strong>¡Ganaste!</strong> Llenaste el tablero con {state.score} puntos.
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1 rounded-lg bg-[#ff906d] text-[#5b1600] font-bold text-[11px] hover:bg-[#ffb59c] transition cursor-pointer"
          >
            Jugar de nuevo
          </button>
        </div>
      )}

      {isPaused && !state.isGameOver && !state.isWon && (
        <div className="flex items-center justify-between w-full p-2 rounded-xl bg-[#1a1a1a] border border-[#262626] text-[#fafafa] text-xs">
          <span>Juego pausado</span>
          <button
            type="button"
            onClick={() => setIsPaused(false)}
            className="px-2.5 py-0.5 rounded-md bg-white text-[#0a0a0a] font-semibold text-[11px] cursor-pointer"
          >
            Reanudar
          </button>
        </div>
      )}

      {/* Game Canvas with Touch Swipe support */}
      <div
        className="relative w-full max-w-[280px] sm:max-w-[300px] aspect-square rounded-2xl overflow-hidden border border-[#262626] shadow-xl touch-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <canvas
          ref={canvasRef}
          width={300}
          height={300}
          className="w-full h-full block"
          role="img"
          aria-label="Tablero de la serpiente"
        />
      </div>

      {/* On-screen D-Pad Controls for mobile */}
      <div
        className="flex flex-col items-center gap-1 pt-1 select-none"
        aria-label="Controles de dirección"
      >
        <button
          type="button"
          onClick={() => handleDirection("UP")}
          aria-label="Mover arriba"
          className="flex size-11 items-center justify-center rounded-xl bg-[#131313] border border-[#262626] text-[#fafafa] active:scale-95 active:bg-[#2b160d] active:border-[#ff906d] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff906d]"
        >
          <ChevronUp className="size-6" />
        </button>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => handleDirection("LEFT")}
            aria-label="Mover a la izquierda"
            className="flex size-11 items-center justify-center rounded-xl bg-[#131313] border border-[#262626] text-[#fafafa] active:scale-95 active:bg-[#2b160d] active:border-[#ff906d] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff906d]"
          >
            <ChevronLeft className="size-6" />
          </button>

          <div className="size-11 flex items-center justify-center rounded-xl bg-[#131313] text-[10px] font-bold text-[#adaaaa]">
            D-PAD
          </div>

          <button
            type="button"
            onClick={() => handleDirection("RIGHT")}
            aria-label="Mover a la derecha"
            className="flex size-11 items-center justify-center rounded-xl bg-[#131313] border border-[#262626] text-[#fafafa] active:scale-95 active:bg-[#2b160d] active:border-[#ff906d] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff906d]"
          >
            <ChevronRight className="size-6" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleDirection("DOWN")}
          aria-label="Mover abajo"
          className="flex size-11 items-center justify-center rounded-xl bg-[#131313] border border-[#262626] text-[#fafafa] active:scale-95 active:bg-[#2b160d] active:border-[#ff906d] transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff906d]"
        >
          <ChevronDown className="size-6" />
        </button>
      </div>
    </div>
  );
}

export default SnakeGame;
