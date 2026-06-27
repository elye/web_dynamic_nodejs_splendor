import type { InternalGameState } from '../game-engine/deck.js';
import type { GemPool, GemColor, Card } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import {
  applyTakeGems,
  applyBuyCard,
  applyReserveCard,
} from '../game-engine/actions.js';
import type { ActionResult } from '../game-engine/actions.js';
import { canAffordCard, effectiveCardCost } from './easy.js';

/**
 * Medium AI: greedy strategy.
 * 1. Buy the highest-VP affordable card (prefer board over reserved).
 * 2. Take gems toward the cheapest unaffordable card.
 * 3. Reserve the highest-VP board card if affordable within 2 turns.
 */
export function mediumMove(game: InternalGameState, playerIndex: number): ActionResult {
  const player = game.players[playerIndex];

  // 1. Buy highest-VP affordable card
  const boardCards: Card[] = game.tiers.flatMap(t => t.faceUp.filter((c): c is Card => c !== null));
  const allCards = [...boardCards, ...player.reservedCards];
  const affordable = allCards
    .filter(c => canAffordCard(c, player))
    .sort((a, b) => b.points - a.points || effectiveCardCost(a, player) - effectiveCardCost(b, player));

  if (affordable.length > 0) {
    const card = affordable[0];
    const fromReserved = player.reservedCards.some(c => c.id === card.id);
    return applyBuyCard(game, playerIndex, card.id, fromReserved);
  }

  // 2. Take gems toward the cheapest-to-complete card
  const cheapest = [...boardCards]
    .sort((a, b) => effectiveCardCost(a, player) - effectiveCardCost(b, player))[0];

  if (cheapest) {
    const gemResult = takeGemsToward(game, playerIndex, cheapest);
    if (gemResult.ok) return gemResult;
  }

  // 3. Reserve highest-VP card if reserved slots available
  if (player.reservedCards.length < 3 && boardCards.length > 0) {
    const best = boardCards.sort((a, b) => b.points - a.points)[0];
    return applyReserveCard(game, playerIndex, best.id);
  }

  // Fallback: take any available gems
  return fallbackTakeGems(game, playerIndex);
}

function takeGemsToward(game: InternalGameState, playerIndex: number, target: Card): ActionResult {
  const player = game.players[playerIndex];
  const shortfall: GemColor[] = [];

  for (const color of GEM_COLORS) {
    const raw = target.cost[color] ?? 0;
    const bonus = player.bonuses[color] ?? 0;
    const have = player.gems[color] ?? 0;
    const needed = Math.max(0, raw - bonus - have);
    if (needed > 0) shortfall.push(color);
  }

  if (shortfall.length === 0) return { ok: false, error: 'Already have enough gems' };

  // Filter to colours available in bank
  const available = shortfall.filter(c => (game.bank[c] ?? 0) > 0);
  if (available.length === 0) return { ok: false, error: 'Needed gems not in bank' };

  // Try double if only one colour needed and bank has ≥4
  if (available.length === 1 && (game.bank[available[0]] ?? 0) >= 4) {
    return applyTakeGems(game, playerIndex, { [available[0]]: 2 });
  }

  const pick = available.slice(0, Math.min(3, available.length));
  const gems: GemPool = {};
  for (const c of pick) gems[c] = 1;
  return applyTakeGems(game, playerIndex, gems);
}

function fallbackTakeGems(game: InternalGameState, playerIndex: number): ActionResult {
  const available = GEM_COLORS.filter(c => (game.bank[c] ?? 0) > 0);
  if (available.length === 0) return { ok: true }; // pass

  const pick = available.slice(0, Math.min(3, available.length));
  const gems: GemPool = {};
  for (const c of pick) gems[c] = 1;
  return applyTakeGems(game, playerIndex, gems);
}
