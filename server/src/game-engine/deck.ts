import type { GameState, PlayerState, TierState, Card, CardTier, GemPool } from '@splendor/shared';
import type { PlayerType, AiDifficulty } from '@splendor/shared';
import {
  TIER1_CARDS,
  TIER2_CARDS,
  TIER3_CARDS,
  ALL_NOBLES,
  GEM_COLORS,
  GEM_BANK_BY_PLAYER_COUNT,
  GOLD_COUNT,
  CARDS_PER_TIER_FACE_UP,
  NOBLES_IN_PLAY_BY_PLAYER_COUNT,
} from '@splendor/shared';

// ─── Fisher-Yates shuffle ─────────────────────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Tier state builder ───────────────────────────────────────────────────────

function buildTier(tier: CardTier, source: Card[]): { faceUp: (Card | null)[]; deck: Card[] } {
  const shuffled = shuffle(source.filter(c => c.tier === tier));
  const faceUp: (Card | null)[] = shuffled.slice(0, CARDS_PER_TIER_FACE_UP);
  const deck = shuffled.slice(CARDS_PER_TIER_FACE_UP);
  return { faceUp, deck };
}

// ─── Internal game state (deck is server-only) ────────────────────────────────

export interface InternalGameState extends GameState {
  decks: [Card[], Card[], Card[]]; // decks[0] = tier-1 deck, etc.
}

// ─── Create initial game state ────────────────────────────────────────────────

export function createGame(
  players: Array<{ id: string; name: string; type: PlayerType; aiDifficulty?: AiDifficulty }>,
): InternalGameState {
  const playerCount = players.length;
  const gemCount = GEM_BANK_BY_PLAYER_COUNT[playerCount] ?? 4;
  const nobleCount = NOBLES_IN_PLAY_BY_PLAYER_COUNT[playerCount] ?? 3;

  // Build gem bank
  const bank: GemPool = {};
  for (const color of GEM_COLORS) {
    bank[color] = gemCount;
  }
  bank['gold'] = GOLD_COUNT;

  // Build tiers
  const t1 = buildTier(1, TIER1_CARDS);
  const t2 = buildTier(2, TIER2_CARDS);
  const t3 = buildTier(3, TIER3_CARDS);

  const tiers: [TierState, TierState, TierState] = [
    { tier: 1, faceUp: t1.faceUp, deckCount: t1.deck.length },
    { tier: 2, faceUp: t2.faceUp, deckCount: t2.deck.length },
    { tier: 3, faceUp: t3.faceUp, deckCount: t3.deck.length },
  ];

  // Pick nobles
  const nobles = shuffle(ALL_NOBLES).slice(0, nobleCount);

  // Build player states
  const playerStates: PlayerState[] = players.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    aiDifficulty: p.aiDifficulty,
    gems: {},
    bonuses: { white: 0, blue: 0, green: 0, red: 0, black: 0 },
    reservedCards: [],
    ownedCards: [],
    nobles: [],
    points: 0,
  }));

  return {
    roomCode: '', // filled in by ws-handler after room is known
    phase: 'playing',
    players: playerStates,
    currentPlayerIndex: 0,
    tiers,
    bank,
    nobles,
    decks: [t1.deck, t2.deck, t3.deck],
  };
}

// ─── Draw from deck ───────────────────────────────────────────────────────────

/**
 * Replace a face-up slot with the top card from the deck.
 * Mutates game.tiers and game.decks in place.
 */
export function refillSlot(game: InternalGameState, tierIndex: number, slotIndex: number): void {
  const deck = game.decks[tierIndex];
  const tier = game.tiers[tierIndex];

  if (deck.length > 0) {
    tier.faceUp[slotIndex] = deck.shift()!;
  } else {
    tier.faceUp[slotIndex] = null;
  }
  tier.deckCount = deck.length;
}

/**
 * Draw the top card from a deck (for face-down reserve).
 * Returns the card or null if deck is empty.
 */
export function drawFromDeck(game: InternalGameState, tierIndex: number): Card | null {
  const deck = game.decks[tierIndex];
  if (deck.length === 0) return null;
  const card = deck.shift()!;
  game.tiers[tierIndex].deckCount = deck.length;
  return card;
}

// ─── Sanitise for broadcast ───────────────────────────────────────────────────

/**
 * Strip the server-only `decks` field before sending to clients.
 */
export function toClientState(game: InternalGameState): GameState {
  const { decks: _decks, ...clientState } = game;
  return clientState;
}
