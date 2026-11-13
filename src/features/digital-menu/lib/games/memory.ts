export interface MemoryCard {
  id: number;
  pairId: number;
  symbol: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export interface MemoryGameState {
  cards: MemoryCard[];
  selectedCardIds: number[];
  moves: number;
  matchesCount: number;
  totalPairs: number;
  isWon: boolean;
}

export const DEFAULT_MEMORY_SYMBOLS: readonly string[] = [
  "🍕",
  "🍔",
  "🌮",
  "🍣",
  "🍦",
  "☕",
  "🥗",
  "🍰",
];

/**
 * Fisher-Yates array shuffle with an injectable RNG.
 */
export function shuffleArray<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

/**
 * Creates a new memory game state with shuffled pairs.
 */
export function createMemoryGame(
  symbols: readonly string[] = DEFAULT_MEMORY_SYMBOLS,
  rng: () => number = Math.random
): MemoryGameState {
  const pairs: Array<{ pairId: number; symbol: string }> = [];
  symbols.forEach((symbol, pairId) => {
    pairs.push({ pairId, symbol });
    pairs.push({ pairId, symbol });
  });

  const shuffled = shuffleArray(pairs, rng);

  const cards: MemoryCard[] = shuffled.map((item, index) => ({
    id: index,
    pairId: item.pairId,
    symbol: item.symbol,
    isFlipped: false,
    isMatched: false,
  }));

  return {
    cards,
    selectedCardIds: [],
    moves: 0,
    matchesCount: 0,
    totalPairs: symbols.length,
    isWon: false,
  };
}

/**
 * Pure reducer to flip a card.
 * Handles single selection, match resolution, and resetting previous mismatches on the next click.
 */
export function flipMemoryCard(state: MemoryGameState, cardId: number): MemoryGameState {
  if (state.isWon) return state;

  const targetCard = state.cards[cardId];
  if (!targetCard || targetCard.isMatched || targetCard.isFlipped) {
    return state;
  }

  // If two cards were already selected (mismatch pending), unflip them first before flipping the new card
  let currentCards = state.cards;
  let activeSelected = state.selectedCardIds;

  if (activeSelected.length >= 2) {
    currentCards = currentCards.map((card) =>
      activeSelected.includes(card.id) && !card.isMatched
        ? { ...card, isFlipped: false }
        : card
    );
    activeSelected = [];
  }

  // Flip the targeted card
  const cardsWithFlipped = currentCards.map((card) =>
    card.id === cardId ? { ...card, isFlipped: true } : card
  );

  // If this is the first card flipped in a pair
  if (activeSelected.length === 0) {
    return {
      ...state,
      cards: cardsWithFlipped,
      selectedCardIds: [cardId],
    };
  }

  // This is the second card flipped
  const firstCardId = activeSelected[0];
  const firstCard = cardsWithFlipped[firstCardId];
  const secondCard = cardsWithFlipped[cardId];
  const nextMoves = state.moves + 1;

  if (firstCard && secondCard && firstCard.pairId === secondCard.pairId) {
    // Matched pair!
    const nextMatches = state.matchesCount + 1;
    const isWon = nextMatches === state.totalPairs;
    const cardsWithMatched = cardsWithFlipped.map((card) =>
      card.id === firstCardId || card.id === cardId
        ? { ...card, isMatched: true, isFlipped: true }
        : card
    );

    return {
      ...state,
      cards: cardsWithMatched,
      selectedCardIds: [],
      moves: nextMoves,
      matchesCount: nextMatches,
      isWon,
    };
  }

  // Mismatch
  return {
    ...state,
    cards: cardsWithFlipped,
    selectedCardIds: [firstCardId, cardId],
    moves: nextMoves,
  };
}

/**
 * Resets currently flipped mismatched cards.
 */
export function resolveMismatches(state: MemoryGameState): MemoryGameState {
  if (state.selectedCardIds.length < 2) return state;

  const cards = state.cards.map((card) =>
    state.selectedCardIds.includes(card.id) && !card.isMatched
      ? { ...card, isFlipped: false }
      : card
  );

  return {
    ...state,
    cards,
    selectedCardIds: [],
  };
}
