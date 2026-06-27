import type { Card, Noble, GemColor, GemPool } from './types.js';

// ─── Gem bank ─────────────────────────────────────────────────────────────────

/** Starting gem counts per colour in the bank, keyed by player count */
export const GEM_BANK_BY_PLAYER_COUNT: Record<number, number> = {
  2: 4,
  3: 5,
  4: 7,
};
export const GOLD_COUNT = 5;
export const MAX_GEMS_IN_HAND = 10;
export const MAX_RESERVED_CARDS = 3;
export const VICTORY_POINTS_THRESHOLD = 15;
export const CARDS_PER_TIER_FACE_UP = 4;

/** Number of nobles to put in play = player count + 1 */
export const NOBLES_IN_PLAY_BY_PLAYER_COUNT: Record<number, number> = {
  2: 3,
  3: 4,
  4: 5,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cost(
  white = 0,
  blue = 0,
  green = 0,
  red = 0,
  black = 0,
): Card['cost'] {
  return { white, blue, green, red, black };
}

function card(
  id: string,
  tier: Card['tier'],
  bonus: GemColor,
  points: number,
  white = 0,
  blue = 0,
  green = 0,
  red = 0,
  black = 0,
): Card {
  return { id, tier, bonus, points, cost: cost(white, blue, green, red, black) };
}

function noble(id: string, white = 0, blue = 0, green = 0, red = 0, black = 0): Noble {
  return { id, points: 3, requirement: cost(white, blue, green, red, black) };
}

// ─── Tier 1 cards (40 cards) ──────────────────────────────────────────────────
// Format: card(id, tier, bonus, points, white, blue, green, red, black)

export const TIER1_CARDS: Card[] = [
  // Black bonus
  card('1-01', 1, 'black', 0, 0, 0, 1, 1, 1),
  card('1-02', 1, 'black', 0, 0, 1, 1, 1, 1),
  card('1-03', 1, 'black', 0, 0, 0, 2, 0, 2),
  card('1-04', 1, 'black', 0, 1, 0, 1, 0, 3),
  card('1-05', 1, 'black', 0, 0, 0, 0, 0, 4),
  card('1-06', 1, 'black', 0, 0, 0, 3, 0, 0),
  card('1-07', 1, 'black', 0, 2, 2, 0, 1, 0),
  card('1-08', 1, 'black', 1, 0, 0, 0, 0, 4),
  // Blue bonus
  card('1-09', 1, 'blue', 0, 1, 1, 1, 1, 0),
  card('1-10', 1, 'blue', 0, 1, 1, 1, 0, 1),
  card('1-11', 1, 'blue', 0, 0, 2, 0, 2, 0),
  card('1-12', 1, 'blue', 0, 3, 1, 0, 0, 1),
  card('1-13', 1, 'blue', 0, 0, 4, 0, 0, 0),
  card('1-14', 1, 'blue', 0, 0, 0, 0, 3, 0),
  card('1-15', 1, 'blue', 0, 1, 0, 2, 2, 0),
  card('1-16', 1, 'blue', 1, 0, 4, 0, 0, 0),
  // White bonus
  card('1-17', 1, 'white', 0, 1, 1, 0, 1, 1),
  card('1-18', 1, 'white', 0, 0, 1, 1, 1, 2),
  card('1-19', 1, 'white', 0, 2, 0, 0, 2, 0),
  card('1-20', 1, 'white', 0, 0, 1, 0, 3, 1),
  card('1-21', 1, 'white', 0, 4, 0, 0, 0, 0),
  card('1-22', 1, 'white', 0, 0, 3, 0, 0, 0),
  card('1-23', 1, 'white', 0, 0, 2, 1, 0, 2),
  card('1-24', 1, 'white', 1, 4, 0, 0, 0, 0),
  // Red bonus
  card('1-25', 1, 'red', 0, 1, 0, 1, 1, 1),
  card('1-26', 1, 'red', 0, 1, 1, 2, 1, 0),
  card('1-27', 1, 'red', 0, 0, 2, 2, 0, 0),
  card('1-28', 1, 'red', 0, 1, 3, 1, 0, 0),
  card('1-29', 1, 'red', 0, 0, 0, 0, 4, 0),
  card('1-30', 1, 'red', 0, 0, 0, 0, 0, 3),
  card('1-31', 1, 'red', 0, 2, 0, 1, 0, 2),
  card('1-32', 1, 'red', 1, 0, 0, 0, 4, 0),
  // Green bonus
  card('1-33', 1, 'green', 0, 0, 1, 1, 0, 2),
  card('1-34', 1, 'green', 0, 2, 1, 1, 0, 1),
  card('1-35', 1, 'green', 0, 0, 0, 2, 2, 0),
  card('1-36', 1, 'green', 0, 0, 1, 0, 1, 3),
  card('1-37', 1, 'green', 0, 0, 0, 4, 0, 0),
  card('1-38', 1, 'green', 0, 3, 0, 0, 0, 0),
  card('1-39', 1, 'green', 0, 1, 2, 0, 0, 2),
  card('1-40', 1, 'green', 1, 0, 0, 4, 0, 0),
];

// ─── Tier 2 cards (30 cards) ──────────────────────────────────────────────────

export const TIER2_CARDS: Card[] = [
  // Black bonus
  card('2-01', 2, 'black', 1, 0, 2, 2, 3, 0),
  card('2-02', 2, 'black', 1, 3, 2, 2, 0, 0),
  card('2-03', 2, 'black', 2, 0, 1, 4, 2, 0),
  card('2-04', 2, 'black', 2, 0, 0, 5, 3, 0),
  card('2-05', 2, 'black', 2, 0, 0, 0, 5, 0),
  card('2-06', 2, 'black', 3, 0, 0, 0, 6, 0),
  // Blue bonus
  card('2-07', 2, 'blue', 1, 0, 0, 3, 2, 2),
  card('2-08', 2, 'blue', 1, 2, 0, 2, 0, 3),
  card('2-09', 2, 'blue', 2, 5, 3, 0, 0, 0),
  card('2-10', 2, 'blue', 2, 2, 0, 0, 1, 4),
  card('2-11', 2, 'blue', 2, 0, 5, 0, 0, 0),
  card('2-12', 2, 'blue', 3, 6, 0, 0, 0, 0),
  // White bonus
  card('2-13', 2, 'white', 1, 0, 3, 0, 2, 2),
  card('2-14', 2, 'white', 1, 2, 3, 0, 0, 2),
  card('2-15', 2, 'white', 2, 0, 0, 0, 4, 1),
  card('2-16', 2, 'white', 2, 4, 2, 0, 0, 1),
  card('2-17', 2, 'white', 2, 5, 0, 0, 0, 0),
  card('2-18', 2, 'white', 3, 0, 0, 0, 0, 6),
  // Red bonus
  card('2-19', 2, 'red', 1, 2, 0, 0, 2, 3),
  card('2-20', 2, 'red', 1, 0, 2, 3, 0, 2),
  card('2-21', 2, 'red', 2, 0, 0, 1, 0, 5),
  card('2-22', 2, 'red', 2, 3, 0, 0, 2, 3),
  card('2-23', 2, 'red', 2, 0, 0, 0, 0, 5),
  card('2-24', 2, 'red', 3, 0, 0, 6, 0, 0),
  // Green bonus
  card('2-25', 2, 'green', 1, 3, 0, 2, 3, 0),
  card('2-26', 2, 'green', 1, 2, 2, 0, 0, 3),
  card('2-27', 2, 'green', 2, 0, 5, 0, 0, 0),
  card('2-28', 2, 'green', 2, 0, 4, 0, 0, 2),
  card('2-29', 2, 'green', 2, 0, 0, 5, 0, 0),
  card('2-30', 2, 'green', 3, 0, 0, 0, 0, 6),  // note: official has 0,0,0,0,6 for various colors
];

// ─── Tier 3 cards (20 cards) ──────────────────────────────────────────────────

export const TIER3_CARDS: Card[] = [
  // Black bonus
  card('3-01', 3, 'black', 3, 3, 3, 5, 3, 0),
  card('3-02', 3, 'black', 4, 0, 0, 0, 7, 0),
  card('3-03', 3, 'black', 4, 3, 0, 0, 6, 3),
  card('3-04', 3, 'black', 5, 0, 0, 0, 7, 3),
  // Blue bonus
  card('3-05', 3, 'blue', 3, 3, 0, 3, 3, 5),
  card('3-06', 3, 'blue', 4, 7, 0, 0, 0, 0),
  card('3-07', 3, 'blue', 4, 6, 3, 0, 0, 3),
  card('3-08', 3, 'blue', 5, 7, 3, 0, 0, 0),
  // White bonus
  card('3-09', 3, 'white', 3, 0, 3, 3, 5, 3),
  card('3-10', 3, 'white', 4, 0, 0, 0, 0, 7),
  card('3-11', 3, 'white', 4, 3, 3, 0, 0, 6),
  card('3-12', 3, 'white', 5, 3, 7, 0, 0, 0),
  // Red bonus
  card('3-13', 3, 'red', 3, 5, 3, 0, 0, 3),
  card('3-14', 3, 'red', 4, 0, 0, 0, 0, 7),
  card('3-15', 3, 'red', 4, 0, 3, 3, 6, 3),
  card('3-16', 3, 'red', 5, 0, 0, 3, 7, 0),
  // Green bonus
  card('3-17', 3, 'green', 3, 3, 5, 0, 3, 3),
  card('3-18', 3, 'green', 4, 0, 0, 7, 0, 0),
  card('3-19', 3, 'green', 4, 3, 3, 6, 0, 3),
  card('3-20', 3, 'green', 5, 0, 0, 7, 3, 0),
];

// ─── All cards flat ───────────────────────────────────────────────────────────

export const ALL_CARDS: Card[] = [...TIER1_CARDS, ...TIER2_CARDS, ...TIER3_CARDS];

// ─── Noble tiles (10 total, pick n+1 per game) ────────────────────────────────

export const ALL_NOBLES: Noble[] = [
  noble('n-01', 4, 4, 0, 0, 0),   // white + blue
  noble('n-02', 3, 3, 3, 0, 0),   // white + blue + green
  noble('n-03', 0, 4, 4, 0, 0),   // blue + green
  noble('n-04', 0, 3, 3, 3, 0),   // blue + green + red
  noble('n-05', 0, 0, 4, 4, 0),   // green + red
  noble('n-06', 0, 0, 3, 3, 3),   // green + red + black
  noble('n-07', 0, 0, 0, 4, 4),   // red + black
  noble('n-08', 3, 0, 0, 3, 3),   // white + red + black
  noble('n-09', 4, 0, 0, 0, 4),   // white + black
  noble('n-10', 3, 3, 0, 0, 3),   // white + blue + black
];

// ─── Gem colours list ─────────────────────────────────────────────────────────

export const GEM_COLORS: GemColor[] = ['white', 'blue', 'green', 'red', 'black'];

export const EMPTY_GEM_COST = (): Card['cost'] => ({
  white: 0, blue: 0, green: 0, red: 0, black: 0,
});

export const EMPTY_GEM_POOL = (): GemPool => ({});

