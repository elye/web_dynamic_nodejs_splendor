import type {
  GemColor,
  GemColorOrGold,
  GemPool,
  PlayerState,
  Card,
  CardTier,
} from '@splendor/shared';
import { GEM_COLORS, MAX_GEMS_IN_HAND, MAX_RESERVED_CARDS } from '@splendor/shared';
import type { InternalGameState } from './deck.js';
import { refillSlot, drawFromDeck } from './deck.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export type ActionResult =
  | { ok: true; pendingDiscard?: number }
  | { ok: false; error: string };

function gemTotal(gems: GemPool): number {
  return Object.values(gems).reduce((s, v) => s + (v ?? 0), 0);
}

function bankGems(bank: GemPool, color: GemColorOrGold): number {
  return bank[color] ?? 0;
}

function playerGems(player: PlayerState, color: GemColorOrGold): number {
  return player.gems[color] ?? 0;
}

function addToPool(pool: GemPool, color: GemColorOrGold, n: number): void {
  pool[color] = (pool[color] ?? 0) + n;
}

function subtractFromPool(pool: GemPool, color: GemColorOrGold, n: number): void {
  const cur = pool[color] ?? 0;
  if (cur - n < 0) throw new Error(`Cannot subtract ${n} ${color} from pool`);
  pool[color] = cur - n;
  if (pool[color] === 0) delete pool[color];
}

// ─── TAKE GEMS ────────────────────────────────────────────────────────────────

export function applyTakeGems(
  game: InternalGameState,
  playerIndex: number,
  requested: GemPool,
): ActionResult {
  const player = game.players[playerIndex];

  // Build list of (color, count) pairs, ignoring gold
  const entries = (Object.entries(requested) as [GemColorOrGold, number][])
    .filter(([c, n]) => c !== 'gold' && n > 0);

  // Validate keys are valid gem colours
  for (const [color] of entries) {
    if (!GEM_COLORS.includes(color as GemColor)) {
      return { ok: false, error: `Invalid gem colour: ${color}` };
    }
  }

  const totalRequested = entries.reduce((s, [, n]) => s + n, 0);
  const uniqueColors = entries.length;
  const counts = entries.map(([, n]) => n);
  const maxCount = Math.max(...counts, 0);

  // Rule: take 3 different OR take 2 of same (pile ≥ 4)
  if (uniqueColors === 3 && counts.every(n => n === 1)) {
    // Valid: 3 different
  } else if (uniqueColors === 1 && maxCount === 2) {
    // Valid: double-take — bank must have ≥ 4
    const [color] = entries[0];
    if (bankGems(game.bank, color) < 4) {
      return { ok: false, error: 'Cannot take 2: fewer than 4 in bank' };
    }
  } else if (uniqueColors === 2 && totalRequested === 2 && counts.every(n => n === 1)) {
    // Valid: take 2 different (player opts for fewer)
  } else if (uniqueColors === 1 && maxCount === 1) {
    // Valid: take 1 (player opts for fewer)
  } else {
    return { ok: false, error: 'Invalid gem selection' };
  }

  // Check bank has enough
  for (const [color, n] of entries) {
    if (bankGems(game.bank, color) < n) {
      return { ok: false, error: `Not enough ${color} gems in bank` };
    }
  }

  // Apply
  for (const [color, n] of entries) {
    subtractFromPool(game.bank, color, n);
    addToPool(player.gems, color, n);
  }

  const newTotal = gemTotal(player.gems);
  const excess = newTotal - MAX_GEMS_IN_HAND;
  if (excess > 0) {
    return { ok: true, pendingDiscard: excess };
  }
  return { ok: true };
}

// ─── DISCARD GEMS ─────────────────────────────────────────────────────────────

export function applyDiscardGems(
  game: InternalGameState,
  playerIndex: number,
  toDiscard: GemPool,
): ActionResult {
  const player = game.players[playerIndex];
  const entries = (Object.entries(toDiscard) as [GemColorOrGold, number][]).filter(([, n]) => n > 0);
  const totalDiscard = entries.reduce((s, [, n]) => s + n, 0);

  const currentTotal = gemTotal(player.gems);
  const excess = currentTotal - MAX_GEMS_IN_HAND;
  if (excess <= 0) {
    return { ok: false, error: 'No discard needed' };
  }
  if (totalDiscard !== excess) {
    return { ok: false, error: `Must discard exactly ${excess} gem(s)` };
  }

  for (const [color, n] of entries) {
    if (playerGems(player, color) < n) {
      return { ok: false, error: `Player doesn't have ${n} ${color}` };
    }
    subtractFromPool(player.gems, color, n);
    addToPool(game.bank, color, n);
  }

  return { ok: true };
}

// ─── BUY CARD ────────────────────────────────────────────────────────────────

function effectiveCost(card: Card, player: PlayerState): GemPool {
  const effective: GemPool = {};
  for (const color of GEM_COLORS) {
    const raw = card.cost[color];
    const bonus = player.bonuses[color] ?? 0;
    const needed = Math.max(0, raw - bonus);
    if (needed > 0) effective[color] = needed;
  }
  return effective;
}

function canAfford(
  player: PlayerState,
  needed: GemPool,
): boolean {
  let goldNeeded = 0;
  for (const color of GEM_COLORS) {
    const n = needed[color] ?? 0;
    const have = playerGems(player, color);
    if (have < n) goldNeeded += n - have;
  }
  return goldNeeded <= playerGems(player, 'gold');
}

export function applyBuyCard(
  game: InternalGameState,
  playerIndex: number,
  cardId: string,
  fromReserved: boolean,
): ActionResult {
  const player = game.players[playerIndex];

  let card: Card | null = null;
  let tierIndex = -1;
  let slotIndex = -1;

  if (fromReserved) {
    const idx = player.reservedCards.findIndex(c => c.id === cardId);
    if (idx === -1) return { ok: false, error: 'Card not in reserved hand' };
    card = player.reservedCards[idx];
  } else {
    outer: for (let t = 0; t < 3; t++) {
      for (let s = 0; s < game.tiers[t].faceUp.length; s++) {
        if (game.tiers[t].faceUp[s]?.id === cardId) {
          card = game.tiers[t].faceUp[s]!;
          tierIndex = t;
          slotIndex = s;
          break outer;
        }
      }
    }
    if (!card) return { ok: false, error: 'Card not on board' };
  }

  const needed = effectiveCost(card, player);
  if (!canAfford(player, needed)) {
    return { ok: false, error: 'Cannot afford card' };
  }

  // Pay gems
  let goldUsed = 0;
  for (const color of GEM_COLORS) {
    const n = needed[color] ?? 0;
    if (n === 0) continue;
    const have = playerGems(player, color);
    const fromGems = Math.min(have, n);
    const fromGold = n - fromGems;
    if (fromGems > 0) {
      subtractFromPool(player.gems, color, fromGems);
      addToPool(game.bank, color, fromGems);
    }
    goldUsed += fromGold;
  }
  if (goldUsed > 0) {
    subtractFromPool(player.gems, 'gold', goldUsed);
    addToPool(game.bank, 'gold', goldUsed);
  }

  // Move card to owned
  if (fromReserved) {
    player.reservedCards = player.reservedCards.filter(c => c.id !== cardId);
  } else {
    refillSlot(game, tierIndex, slotIndex);
  }

  player.ownedCards.push(card);
  player.bonuses[card.bonus] = (player.bonuses[card.bonus] ?? 0) + 1;
  player.points += card.points;

  return { ok: true };
}

// ─── RESERVE CARD ─────────────────────────────────────────────────────────────

export function applyReserveCard(
  game: InternalGameState,
  playerIndex: number,
  cardId: string | null,
  tier?: CardTier,
): ActionResult {
  const player = game.players[playerIndex];

  if (player.reservedCards.length >= MAX_RESERVED_CARDS) {
    return { ok: false, error: 'Already have 3 reserved cards' };
  }

  let card: Card | null = null;
  let tierIndex = -1;
  let slotIndex = -1;

  if (cardId === null) {
    // Reserve face-down from deck
    if (tier == null) return { ok: false, error: 'Tier required for face-down reserve' };
    tierIndex = tier - 1;
    card = drawFromDeck(game, tierIndex);
    if (!card) return { ok: false, error: 'Deck is empty' };
  } else {
    outer: for (let t = 0; t < 3; t++) {
      for (let s = 0; s < game.tiers[t].faceUp.length; s++) {
        if (game.tiers[t].faceUp[s]?.id === cardId) {
          card = game.tiers[t].faceUp[s]!;
          tierIndex = t;
          slotIndex = s;
          break outer;
        }
      }
    }
    if (!card) return { ok: false, error: 'Card not on board' };
    refillSlot(game, tierIndex, slotIndex);
  }

  player.reservedCards.push(card);

  // Award gold if available
  if ((game.bank['gold'] ?? 0) > 0) {
    subtractFromPool(game.bank, 'gold', 1);
    addToPool(player.gems, 'gold', 1);
  }

  const newTotal = gemTotal(player.gems);
  const excess = newTotal - MAX_GEMS_IN_HAND;
  if (excess > 0) {
    return { ok: true, pendingDiscard: excess };
  }
  return { ok: true };
}
