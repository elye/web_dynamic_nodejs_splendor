import type { InternalGameState } from '../game-engine/deck.js';
import type { GemPool, GemColor, Card, Noble } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import {
  applyTakeGems,
  applyBuyCard,
  applyReserveCard,
} from '../game-engine/actions.js';
import type { ActionResult } from '../game-engine/actions.js';
import { canAffordCard, effectiveCardCost } from './easy.js';

/**
 * Hard AI: heuristic strategy.
 * Priorities:
 * 1. Buy the highest-VP affordable card that advances a noble or is Tier 3.
 * 2. Buy any affordable card (highest VP first).
 * 3. Reserve a Tier 3 card before opponents if we can afford it within 3 turns.
 * 4. Take gems toward the nearest noble completion.
 * 5. Take gems toward the highest-value affordable card.
 */
export function hardMove(game: InternalGameState, playerIndex: number): ActionResult {
  const player = game.players[playerIndex];

  const boardCards: Card[] = game.tiers.flatMap(t => t.faceUp.filter((c): c is Card => c !== null));
  const allCards = [...boardCards, ...player.reservedCards];
  const affordable = allCards.filter(c => canAffordCard(c, player));

  // Score each affordable card
  const scored = affordable
    .map(c => ({ card: c, score: scoreCard(c, player, game.nobles) }))
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const { card } = scored[0];
    const fromReserved = player.reservedCards.some(c => c.id === card.id);
    return applyBuyCard(game, playerIndex, card.id, fromReserved);
  }

  // Pre-emptive reserve: grab a high-value Tier 3 card
  if (player.reservedCards.length < 3) {
    const tier3Cards = game.tiers[2].faceUp.filter((c): c is Card => c !== null);
    const highValue = tier3Cards.sort((a, b) => b.points - a.points)[0];
    if (highValue && effectiveCardCost(highValue, player) <= 6) {
      return applyReserveCard(game, playerIndex, highValue.id);
    }
  }

  // Take gems toward nearest noble
  const nobleResult = takeGemsForNoble(game, playerIndex);
  if (nobleResult.ok) return nobleResult;

  // Take gems toward the best affordable target
  const target = [...boardCards].sort((a, b) =>
    scoreCard(b, player, game.nobles) - scoreCard(a, player, game.nobles))[0];

  if (target) {
    const result = takeGemsToward(game, playerIndex, target);
    if (result.ok) return result;
  }

  // Fallback: take any 3 gems
  return fallbackTakeGems(game, playerIndex);
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreCard(card: Card, player: { bonuses: Record<GemColor, number>; gems: GemPool }, nobles: Noble[]): number {
  let score = card.points * 10;

  // Bonus for advancing toward a noble
  for (const noble of nobles) {
    const req = noble.requirement[card.bonus] ?? 0;
    const have = player.bonuses[card.bonus] ?? 0;
    if (have < req) score += 5; // this card moves us toward this noble
  }

  // Tier bonus (higher tier = higher score)
  score += card.tier * 2;

  // Penalise higher effective cost
  score -= effectiveCardCost(card, player);

  return score;
}

// ─── Gem taking helpers ───────────────────────────────────────────────────────

function takeGemsForNoble(game: InternalGameState, playerIndex: number): ActionResult {
  const player = game.players[playerIndex];

  // Find the noble we're closest to completing
  const noblesWithGap = game.nobles.map(noble => {
    let gap = 0;
    const needed: GemColor[] = [];
    for (const color of GEM_COLORS) {
      const req = noble.requirement[color] ?? 0;
      const have = player.bonuses[color] ?? 0;
      if (have < req) {
        gap += req - have;
        needed.push(color);
      }
    }
    return { noble, gap, needed };
  });

  noblesWithGap.sort((a, b) => a.gap - b.gap);

  for (const { needed } of noblesWithGap) {
    // We need cards of these bonus colours — take gems of those colours
    const available = needed.filter(c => (game.bank[c] ?? 0) > 0);
    if (available.length === 0) continue;

    if (available.length === 1 && (game.bank[available[0]] ?? 0) >= 4) {
      const result = applyTakeGems(game, playerIndex, { [available[0]]: 2 });
      if (result.ok) return result;
    }

    const pick = available.slice(0, Math.min(3, available.length));
    const gems: GemPool = {};
    for (const c of pick) gems[c] = 1;
    const result = applyTakeGems(game, playerIndex, gems);
    if (result.ok) return result;
  }

  return { ok: false, error: 'No noble gem path' };
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

  const available = shortfall.filter(c => (game.bank[c] ?? 0) > 0);
  if (available.length === 0) return { ok: false, error: 'Needed gems not in bank' };

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
  if (available.length === 0) return { ok: true };
  const pick = available.slice(0, Math.min(3, available.length));
  const gems: GemPool = {};
  for (const c of pick) gems[c] = 1;
  return applyTakeGems(game, playerIndex, gems);
}
