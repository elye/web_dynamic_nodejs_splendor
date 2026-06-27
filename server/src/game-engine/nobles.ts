import type { PlayerState, Noble } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';

/**
 * Check which nobles a player qualifies for.
 * Noble requirement = minimum card bonuses per colour.
 * Returns the list of qualifying nobles.
 */
export function getQualifyingNobles(player: PlayerState, nobles: Noble[]): Noble[] {
  return nobles.filter(noble =>
    GEM_COLORS.every(color => (player.bonuses[color] ?? 0) >= (noble.requirement[color] ?? 0)),
  );
}

/**
 * Award a single noble by id to the player.
 * Removes it from the board's noble array.
 * Mutates both player and nobles array in place.
 */
export function awardNobleById(
  player: PlayerState,
  boardNobles: Noble[],
  nobleId: string,
): Noble | null {
  const idx = boardNobles.findIndex(n => n.id === nobleId);
  if (idx === -1) return null;

  const noble = boardNobles[idx];
  const qualifies = GEM_COLORS.every(
    color => (player.bonuses[color] ?? 0) >= (noble.requirement[color] ?? 0),
  );
  if (!qualifies) return null;

  boardNobles.splice(idx, 1);
  player.nobles.push(noble);
  player.points += noble.points;
  return noble;
}
