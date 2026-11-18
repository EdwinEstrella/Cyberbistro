import { useState, useEffect, useRef } from "react";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react";
import {
  createMemoryGame,
  flipMemoryCard,
  resolveMismatches,
  type MemoryGameState,
} from "../../../lib/games/memory";

export interface MemoryGameProps {
  onBack: () => void;
}

export function MemoryGame({ onBack }: MemoryGameProps) {
  const [gameState, setGameState] = useState<MemoryGameState>(() => createMemoryGame());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCardClick = (cardId: number) => {
    if (gameState.isWon) return;

    // Clear any pending mismatch timer when user acts early
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const nextState = flipMemoryCard(gameState, cardId);
    setGameState(nextState);

    // If two mismatched cards are now selected, set a brief timer to flip them back
    if (nextState.selectedCardIds.length === 2) {
      timerRef.current = setTimeout(() => {
        setGameState((prev) => resolveMismatches(prev));
        timerRef.current = null;
      }, 750);
    }
  };

  const handleReset = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setGameState(createMemoryGame());
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto space-y-4">
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
            Movimientos: <strong className="text-white">{gameState.moves}</strong>
          </span>
          <span className="text-[#adaaaa]">
            Parejas:{" "}
            <strong className="text-[#ff906d]">
              {gameState.matchesCount} / {gameState.totalPairs}
            </strong>
          </span>
        </div>

        <button
          type="button"
          onClick={handleReset}
          aria-label="Reiniciar juego de memoria"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#131313] border border-[#262626] text-xs font-semibold text-[#adaaaa] hover:text-[#fafafa] hover:border-[#3a3a3a] transition cursor-pointer"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reiniciar</span>
        </button>
      </div>

      {/* Screen-reader Live Status */}
      <div className="sr-only" aria-live="polite" role="status">
        {gameState.isWon
          ? `¡Felicidades, ganaste en ${gameState.moves} movimientos!`
          : `Parejas encontradas: ${gameState.matchesCount} de ${gameState.totalPairs}. Movimientos: ${gameState.moves}.`}
      </div>

      {/* Win Banner */}
      {gameState.isWon && (
        <div
          role="status"
          className="flex items-center justify-between w-full p-3 rounded-xl bg-[#2b160d] border border-[#5b2a17] text-[#ffb59c] text-xs shadow-lg animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <Trophy className="size-4 text-[#ff906d] shrink-0" />
            <span>
              <strong>¡Ganaste!</strong> Completado en {gameState.moves} movimientos.
            </span>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-1 rounded-lg bg-[#ff906d] text-[#5b1600] font-bold text-[11px] hover:bg-[#ffb59c] transition cursor-pointer"
          >
            Jugar otra vez
          </button>
        </div>
      )}

      {/* 4x4 Cards Grid */}
      <div
        role="grid"
        aria-label="Tablero de juego de memoria"
        className="grid grid-cols-4 gap-2.5 w-full aspect-square max-w-[320px] sm:max-w-[340px] p-2 rounded-2xl bg-[#0e0e0e] border border-[#262626]"
      >
        {gameState.cards.map((card) => {
          const isRevealed = card.isFlipped || card.isMatched;

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardClick(card.id)}
              disabled={card.isMatched || card.isFlipped}
              aria-label={
                isRevealed
                  ? `Carta ${card.id + 1}: ${card.symbol}${card.isMatched ? " emparejada" : ""}`
                  : `Carta ${card.id + 1} oculta`
              }
              className={`flex items-center justify-center rounded-xl text-2xl sm:text-3xl font-bold transition-all duration-200 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff906d] ${
                card.isMatched
                  ? "bg-[#2b160d] border border-[#5b2a17] text-[#ffb59c] shadow-inner opacity-90 scale-98"
                  : isRevealed
                  ? "bg-[#131313] border-2 border-[#ff906d] text-white shadow-md scale-102"
                  : "bg-[#131313] border border-[#262626] text-transparent hover:border-[#3a3a3a] hover:bg-[#1a1a1a] active:scale-95"
              }`}
            >
              <span aria-hidden="true" className={isRevealed ? "block" : "invisible"}>
                {card.symbol}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default MemoryGame;
