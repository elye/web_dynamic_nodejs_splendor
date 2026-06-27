import type { PlayerState } from '@splendor/shared';
import { VICTORY_POINTS_THRESHOLD } from '@splendor/shared';
import type { InternalGameState } from './deck.js';

/**
 * Called after every turn action + noble awards.
 *
 * Returns true if a player has crossed 15 VP (triggers final round).
 * Does NOT set phase to 'finished' — the ws-handler controls that
 * after the full round completes.
 */
export function hasTriggeredEndgame(game: InternalGameState): boolean {
  return game.players.some(p => p.points >= VICTORY_POINTS_THRESHOLD);
}

/**
 * Called at the end of the final round (after the last player in the
 * round has taken their turn). Resolves winner(s) and sets game.phase.
 *
 * Tiebreak rules (official Splendor):
 *  1. Most prestige points wins.
 *  2. Fewest development cards (owned cards, not reserved) breaks the tie.
 *  3. Further ties result in shared victory.
 */
export function resolveWinners(game: InternalGameState): void {
  const players = game.players;

  let maxPoints = 0;
  for (const p of players) {
    if (p.points > maxPoints) maxPoints = p.points;
  }

  const topPlayers = players.filter(p => p.points === maxPoints);

  let minCards = Infinity;
  for (const p of topPlayers) {
    if (p.ownedCards.length < minCards) minCards = p.ownedCards.length;
  }

  const winners = topPlayers.filter(p => p.ownedCards.length === minCards);

  game.winnerIds = winners.map(p => p.id);
  game.phase = 'finished';
}

/**
 * After advancing the turn index, check if the round has completed
 * (i.e., we've looped back to the first player) and if endgame was
 * triggered before this round started.
 */
export function checkAndResolveEndgame(
  game: InternalGameState,
  endgameTriggered: boolean,
): boolean {
  if (!endgameTriggered) return false;
  if (game.currentPlayerIndex !== 0) return false;
  // Full round complete — resolve
  resolveWinners(game);
  return true;
}
