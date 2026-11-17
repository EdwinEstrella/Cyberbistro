import { Brain, Grid3X3, Worm, Layers, ChevronRight, type LucideIcon } from "lucide-react";
import { publicMenuTheme } from "../publicMenuTheme";

export type GameId = "memory" | "tictactoe" | "snake" | "2048";

export interface GameMetadata {
  id: GameId;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}

export const GAMES_CATALOG: readonly GameMetadata[] = [
  {
    id: "memory",
    title: "Memoria",
    description: "Encuentra las parejas de comida antes de que llegue tu pedido",
    icon: Brain,
    badge: "16 cartas",
  },
  {
    id: "tictactoe",
    title: "Tres en raya",
    description: "El clásico juego contra la máquina con dificultad inteligente",
    icon: Grid3X3,
    badge: "Solo vs CPU",
  },
  {
    id: "snake",
    title: "Serpiente",
    description: "Come y crece por el tablero con swipe táctil o botones D-Pad",
    icon: Worm,
    badge: "Arcade",
  },
  {
    id: "2048",
    title: "2048",
    description: "Desliza fichas, fusiona valores iguales y alcanza la casilla 2048",
    icon: Layers,
    badge: "Puzzle",
  },
];

export interface GamesListProps {
  onSelectGame: (gameId: GameId) => void;
}

export function GamesList({ onSelectGame }: GamesListProps) {
  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-1 gap-2.5">
        {GAMES_CATALOG.map((game) => {
          const Icon = game.icon;

          return (
            <button
              key={game.id}
              type="button"
              onClick={() => onSelectGame(game.id)}
              className="flex items-center gap-3.5 p-3.5 rounded-[18px] border border-[#262626] bg-[#1a1a1a] hover:border-[#3a3a3a] hover:bg-[#202024] active:scale-98 transition text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ff906d]"
            >
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2b160d] border border-[#5b2a17] text-[#ff906d] group-hover:bg-[#5b2a17]/50 transition">
                <Icon className="size-5.5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`text-sm font-bold text-[#fafafa] group-hover:text-[#ffb59c] transition ${publicMenuTheme.headingFontClass}`}>
                    {game.title}
                  </h3>
                  {game.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#262626] text-[#adaaaa] border border-[#3a3a3a]">
                      {game.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#adaaaa] line-clamp-2 leading-relaxed">
                  {game.description}
                </p>
              </div>

              <div className="size-8 rounded-lg bg-[#131313] border border-[#262626] text-[#adaaaa] group-hover:text-[#fafafa] group-hover:border-[#3a3a3a] flex items-center justify-center shrink-0 transition">
                <ChevronRight className="size-4" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
