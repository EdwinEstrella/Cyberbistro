import { useState, lazy, Suspense } from "react";
import { BottomSheet } from "../../public-home/BottomSheet";
import { GamesList, type GameId } from "./GamesList";
import { GameSkeleton } from "./GameSkeleton";

// Lazy-loaded games so the public menu bundle stays small until opened
const LazyMemoryGame = lazy(() => import("./MemoryGame"));
const LazyTicTacToeGame = lazy(() => import("./TicTacToeGame"));
const LazySnakeGame = lazy(() => import("./SnakeGame"));
const LazyGame2048 = lazy(() => import("./Game2048"));

export interface GamesSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

const GAME_TITLES: Record<GameId, string> = {
  memory: "Memoria",
  tictactoe: "Tres en raya",
  snake: "Serpiente",
  "2048": "2048",
};

export function GamesSheet({ isOpen, onClose }: GamesSheetProps) {
  const [selectedGame, setSelectedGame] = useState<GameId | null>(null);

  const handleClose = () => {
    setSelectedGame(null);
    onClose();
  };

  const title = selectedGame ? GAME_TITLES[selectedGame] : "Juegos para la espera";
  const description = selectedGame
    ? undefined
    : "Entretente con juegos clásicos mientras preparan tu pedido";

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      description={description}
    >
      <div className="w-full pt-1">
        {selectedGame === null && (
          <GamesList onSelectGame={(gameId) => setSelectedGame(gameId)} />
        )}

        {selectedGame === "memory" && (
          <Suspense fallback={<GameSkeleton />}>
            <LazyMemoryGame onBack={() => setSelectedGame(null)} />
          </Suspense>
        )}

        {selectedGame === "tictactoe" && (
          <Suspense fallback={<GameSkeleton />}>
            <LazyTicTacToeGame onBack={() => setSelectedGame(null)} />
          </Suspense>
        )}

        {selectedGame === "snake" && (
          <Suspense fallback={<GameSkeleton />}>
            <LazySnakeGame onBack={() => setSelectedGame(null)} />
          </Suspense>
        )}

        {selectedGame === "2048" && (
          <Suspense fallback={<GameSkeleton />}>
            <LazyGame2048 onBack={() => setSelectedGame(null)} />
          </Suspense>
        )}
      </div>
    </BottomSheet>
  );
}

export default GamesSheet;
