import type { AiDifficulty } from '@splendor/shared';
import type { InternalGameState } from '../game-engine/deck.js';
import { easyMove } from './easy.js';
import { mediumMove } from './medium.js';
import { hardMove } from './hard.js';
import { awardNobles } from '../game-engine/nobles.js';
import { hasTriggeredEndgame, checkAndResolveEndgame } from '../game-engine/endgame.js';

const AI_DELAY_MS = 1200; // artificial thinking delay

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute one AI turn for the player at `playerIndex`.
 * Returns when the turn is fully complete (including nobles + endgame check).
 * The caller is responsible for broadcasting state after this resolves.
 */
export async function executeAiTurn(
  game: InternalGameState,
  playerIndex: number,
  difficulty: AiDifficulty,
  endgameTriggered: boolean,
): Promise<{ endgameTriggeredNow: boolean; gameOver: boolean }> {
  await delay(AI_DELAY_MS);

  let result;
  if (difficulty === 'easy') {
    result = easyMove(game, playerIndex);
  } else if (difficulty === 'medium') {
    result = mediumMove(game, playerIndex);
  } else {
    result = hardMove(game, playerIndex);
  }

  // If the AI needs to discard (should be rare since AI picks sensibly), auto-discard
  if (result.ok && result.pendingDiscard && result.pendingDiscard > 0) {
    autoDiscard(game, playerIndex, result.pendingDiscard);
  }

  // Award nobles
  awardNobles(game.players[playerIndex], game.nobles);

  // Check if this turn triggered endgame
  const triggeredNow = !endgameTriggered && hasTriggeredEndgame(game);
  const nowTriggered = endgameTriggered || triggeredNow;

  // Advance turn
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;

  // Check if round complete
  const gameOver = checkAndResolveEndgame(game, nowTriggered);

  return { endgameTriggeredNow: triggeredNow, gameOver };
}

function autoDiscard(game: InternalGameState, playerIndex: number, excess: number): void {
  const player = game.players[playerIndex];
  let remaining = excess;
  // Discard from colours we have most of, excluding gold
  const colors = Object.entries(player.gems)
    .filter(([c]) => c !== 'gold')
    .sort(([, a], [, b]) => (b as number) - (a as number)) as [string, number][];

  for (const [color, count] of colors) {
    if (remaining <= 0) break;
    const discard = Math.min(remaining, count);
    player.gems[color as keyof typeof player.gems] = count - discard;
    if (player.gems[color as keyof typeof player.gems] === 0) {
      delete player.gems[color as keyof typeof player.gems];
    }
    game.bank[color as keyof typeof game.bank] = ((game.bank[color as keyof typeof game.bank] as number) ?? 0) + discard;
    remaining -= discard;
  }
}
