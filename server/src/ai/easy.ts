import type { InternalGameState } from '../game-engine/deck.js';
import type { GemPool, GemColor, Card } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import {
  applyTakeGems,
  applyBuyCard,
  applyReserveCard,
} from '../game-engine/actions.js';
import type { ActionResult } from '../game-engine/actions.js';

/**
 * Easy AI: pick a random valid move.
 * Priority: buy any affordable card > reserve if hand not full > take random gems.
 */
export function easyMove(game: InternalGameState, playerIndex: number): ActionResult {
  const player = game.players[playerIndex];

  // 1. Buy any affordable card (board or reserved)
  const boardCards: Card[] = game.tiers.flatMap(t => t.faceUp.filter((c): c is Card => c !== null));
  const allAffordable = [...boardCards, ...player.reservedCards].filter(card =>
    canAffordCard(card, player),
  );

  if (allAffordable.length > 0) {
    const card = allAffordable[Math.floor(Math.random() * allAffordable.length)];
    const fromReserved = player.reservedCards.some(c => c.id === card.id);
    return applyBuyCard(game, playerIndex, card.id, fromReserved);
  }

  // 2. Take gems (random valid selection)
  const gemResult = randomTakeGems(game, playerIndex);
  if (gemResult.ok) return gemResult;

  // 3. Reserve a random board card if possible
  if (player.reservedCards.length < 3) {
    const available = boardCards;
    if (available.length > 0) {
      const card = available[Math.floor(Math.random() * available.length)];
      return applyReserveCard(game, playerIndex, card.id);
    }
  }

  // Fallback: pass (take 0 gems — shouldn't normally happen)
  return { ok: true };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function canAffordCard(card: Card, player: { bonuses: Record<GemColor, number>; gems: GemPool }): boolean {
  let goldNeeded = 0;
  for (const color of GEM_COLORS) {
    const raw = card.cost[color] ?? 0;
    const bonus = player.bonuses[color] ?? 0;
    const needed = Math.max(0, raw - bonus);
    const have = player.gems[color] ?? 0;
    if (have < needed) goldNeeded += needed - have;
  }
  return goldNeeded <= (player.gems['gold'] ?? 0);
}

export function effectiveCardCost(card: Card, player: { bonuses: Record<GemColor, number> }): number {
  let total = 0;
  for (const color of GEM_COLORS) {
    total += Math.max(0, (card.cost[color] ?? 0) - (player.bonuses[color] ?? 0));
  }
  return total;
}

function randomTakeGems(game: InternalGameState, playerIndex: number): ActionResult {
  const available = GEM_COLORS.filter(c => (game.bank[c] ?? 0) > 0);
  if (available.length === 0) return { ok: false, error: 'No gems available' };

  // Try double-take
  const doubleable = available.filter(c => (game.bank[c] ?? 0) >= 4);
  if (doubleable.length > 0 && Math.random() < 0.3) {
    const color = doubleable[Math.floor(Math.random() * doubleable.length)];
    return applyTakeGems(game, playerIndex, { [color]: 2 });
  }

  // Take up to 3 different
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const pick = shuffled.slice(0, Math.min(3, shuffled.length));
  const gems: GemPool = {};
  for (const c of pick) gems[c] = 1;
  return applyTakeGems(game, playerIndex, gems);
}
