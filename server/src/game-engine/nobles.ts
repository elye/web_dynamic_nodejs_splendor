import type { PlayerState, Noble } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';

/**
 * Check which nobles a player qualifies for.
 * Noble requirement = minimum card bonuses per colour.
 * Returns the list of qualifying nobles (can be multiple — player keeps all).
 */
export function getQualifyingNobles(player: PlayerState, nobles: Noble[]): Noble[] {
  return nobles.filter(noble =>
    GEM_COLORS.every(color => (player.bonuses[color] ?? 0) >= (noble.requirement[color] ?? 0)),
  );
}

/**
 * Award all qualifying nobles to the player at end of turn.
 * Removes them from the board's noble array.
 * Mutates both player and nobles array in place.
 */
export function awardNobles(player: PlayerState, boardNobles: Noble[]): void {
  const qualifying = getQualifyingNobles(player, boardNobles);
  for (const noble of qualifying) {
    const idx = boardNobles.findIndex(n => n.id === noble.id);
    if (idx !== -1) {
      boardNobles.splice(idx, 1);
      player.nobles.push(noble);
      player.points += noble.points;
    }
  }
}
