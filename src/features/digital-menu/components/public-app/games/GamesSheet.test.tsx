import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GamesSheet } from "./GamesSheet";
import { GamesList } from "./GamesList";
import { MemoryGame } from "./MemoryGame";
import { TicTacToeGame } from "./TicTacToeGame";
import { SnakeGame } from "./SnakeGame";
import { Game2048 } from "./Game2048";

describe("GamesSheet", () => {
  it("renders nothing when closed", () => {
    const html = renderToStaticMarkup(
      <GamesSheet isOpen={false} onClose={vi.fn()} />
    );
    expect(html).toBe("");
  });

  it("renders games catalog with 4 games when open", () => {
    const html = renderToStaticMarkup(
      <GamesSheet isOpen={true} onClose={vi.fn()} />
    );

    expect(html).toContain("Juegos para la espera");
    expect(html).toContain("Entretente con juegos clásicos mientras preparan tu pedido");
    expect(html).not.toContain("Entretenete");
    expect(html).toContain("Memoria");
    expect(html).toContain("Tres en raya");
    expect(html).toContain("Serpiente");
    expect(html).toContain("2048");
    expect(html).toContain('aria-label="Cerrar"');
  });
});

describe("GamesList", () => {
  it("renders all 4 game options with descriptions and badges", () => {
    const html = renderToStaticMarkup(
      <GamesList onSelectGame={vi.fn()} />
    );

    expect(html).toContain("Memoria");
    expect(html).toContain("16 cartas");
    expect(html).toContain("Tres en raya");
    expect(html).toContain("Solo vs CPU");
    expect(html).toContain("Serpiente");
    expect(html).toContain("Arcade");
    expect(html).toContain("2048");
    expect(html).toContain("Puzzle");
  });
});

describe("MemoryGame", () => {
  it("renders 16 cards, moves, matches and control buttons", () => {
    const html = renderToStaticMarkup(
      <MemoryGame onBack={vi.fn()} />
    );

    expect(html).toContain("Volver");
    expect(html).toContain("Reiniciar");
    expect(html).toContain("Movimientos:");
    expect(html).toContain("Parejas:");
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Tablero de juego de memoria"');
    // Check cards
    expect(html).toContain('Carta 1 oculta');
    expect(html).toContain('Carta 16 oculta');
  });
});

describe("TicTacToeGame", () => {
  it("renders 3x3 grid, turn indicator, scores and control buttons", () => {
    const html = renderToStaticMarkup(
      <TicTacToeGame onBack={vi.fn()} />
    );

    expect(html).toContain("Volver");
    expect(html).toContain("Reiniciar");
    expect(html).toContain("Tu turno (X)");
    expect(html).toContain("Jugador (X) vs CPU (O)");
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Tablero de tres en raya"');
    expect(html).toContain('aria-label="Casilla fila 1, columna 1: vacía"');
    expect(html).toContain('aria-label="Casilla fila 3, columna 3: vacía"');
  });
});

describe("SnakeGame", () => {
  it("renders canvas, score, pause button and on-screen D-Pad controls", () => {
    const html = renderToStaticMarkup(
      <SnakeGame onBack={vi.fn()} />
    );

    expect(html).toContain("Volver");
    expect(html).toContain("Reiniciar");
    expect(html).toContain("Puntos:");
    expect(html).toContain("Mejor:");
    expect(html).toContain("<canvas");
    expect(html).toContain('aria-label="Tablero de la serpiente"');
    // D-Pad buttons
    expect(html).toContain('aria-label="Mover arriba"');
    expect(html).toContain('aria-label="Mover abajo"');
    expect(html).toContain('aria-label="Mover a la izquierda"');
    expect(html).toContain('aria-label="Mover a la derecha"');
  });
});

describe("Game2048", () => {
  it("renders 4x4 grid, scores and on-screen D-Pad controls", () => {
    const html = renderToStaticMarkup(
      <Game2048 onBack={vi.fn()} />
    );

    expect(html).toContain("Volver");
    expect(html).toContain("Reiniciar");
    expect(html).toContain("Puntos:");
    expect(html).toContain("Mejor:");
    expect(html).toContain('role="grid"');
    expect(html).toContain('aria-label="Tablero 2048"');
    // D-Pad buttons
    expect(html).toContain('aria-label="Mover arriba"');
    expect(html).toContain('aria-label="Mover abajo"');
    expect(html).toContain('aria-label="Mover a la izquierda"');
    expect(html).toContain('aria-label="Mover a la derecha"');
  });
});
