import type { PlayerState, GemColor } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import { renderCard, renderGemToken, renderNobleTile } from './card.js';

// ─── Opponent strip ───────────────────────────────────────────────────────────

export function renderOpponentStrip(
  player: PlayerState,
  isCurrentTurn: boolean,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `opponent-strip${isCurrentTurn ? ' active-turn' : ''}`;

  const summary = document.createElement('div');
  summary.className = 'opponent-summary';

  // Name
  const name = document.createElement('div');
  name.className = 'player-name';
  name.textContent = player.name;
  summary.appendChild(name);

  // Points
  const pts = document.createElement('div');
  pts.className = 'player-pts';
  pts.textContent = String(player.points);
  summary.appendChild(pts);

  el.appendChild(summary);

  const details = document.createElement('div');
  details.className = 'opponent-details';

  // Gem tokens (compact)
  const gemsEl = document.createElement('div');
  gemsEl.className = 'mini-gems';
  const allColors: (GemColor | 'gold')[] = [...GEM_COLORS, 'gold'];
  for (const color of allColors) {
    const count = player.gems[color] ?? 0;
    if (count === 0) continue;
    const token = renderGemToken(color, count, 'sz-sm');
    gemsEl.appendChild(token);
  }
  details.appendChild(gemsEl);

  // Bonuses
  const bonusEl = document.createElement('div');
  bonusEl.className = 'mini-bonuses';
  for (const color of GEM_COLORS) {
    const n = player.bonuses[color] ?? 0;
    if (n === 0) continue;
    const chip = document.createElement('span');
    chip.className = `mini-bonus ${color}`;
    chip.textContent = String(n);
    bonusEl.appendChild(chip);
  }
  details.appendChild(bonusEl);

  // Reserved count
  if (player.reservedCards.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'reserved-badge';
    badge.textContent = `✦${player.reservedCards.length}`;
    details.appendChild(badge);
  }

  el.appendChild(details);

  return el;
}

// ─── My player panel ──────────────────────────────────────────────────────────

export interface MyPanelCallbacks {
  onReservedCardClick: (card: import('@splendor/shared').Card) => void;
  isMyTurn: boolean;
  canAfford: (card: import('@splendor/shared').Card) => boolean;
}

export function renderMyPanel(
  container: HTMLElement,
  player: PlayerState,
  cb: MyPanelCallbacks,
): void {
  container.innerHTML = '';
  container.className = 'my-panel';

  if (cb.isMyTurn) {
    const label = document.createElement('div');
    label.className = 'my-turn-label';
    label.textContent = 'Your Turn';
    container.before(label); // inject above the panel bar
  }

  // ── Points ──
  const pointsSection = makeSection('Points');
  const pts = document.createElement('div');
  pts.className = 'my-points-badge';
  pts.textContent = String(player.points);
  pointsSection.appendChild(pts);
  container.appendChild(pointsSection);

  // ── Gems ──
  const gemSection = makeSection('Gems');
  const gemsGrid = document.createElement('div');
  gemsGrid.className = 'my-gems-grid';
  const allColors: (GemColor | 'gold')[] = [...GEM_COLORS, 'gold'];
  for (const color of allColors) {
    const count = player.gems[color] ?? 0;
    const slot = document.createElement('div');
    slot.className = 'my-gem-slot';
    slot.appendChild(renderGemToken(color, undefined, 'sz-sm'));
    const cnt = document.createElement('div');
    cnt.className = 'my-gem-count';
    cnt.textContent = String(count);
    slot.appendChild(cnt);
    gemsGrid.appendChild(slot);
  }
  gemSection.appendChild(gemsGrid);
  container.appendChild(gemSection);

  // ── Bonuses ──
  const bonusSection = makeSection('Bonuses');
  const bonusRow = document.createElement('div');
  bonusRow.className = 'my-bonuses-row';
  for (const color of GEM_COLORS) {
    const n = player.bonuses[color] ?? 0;
    const chip = document.createElement('span');
    chip.className = `my-bonus-chip ${color}`;
    chip.textContent = String(n);
    bonusRow.appendChild(chip);
  }
  bonusSection.appendChild(bonusRow);
  container.appendChild(bonusSection);

  // ── Reserved cards ──
  if (player.reservedCards.length > 0) {
    const resSection = makeSection('Reserved');
    const row = document.createElement('div');
    row.className = 'my-reserved-row';
    for (const card of player.reservedCards) {
      const affordable = cb.canAfford(card);
      const el = renderCard(card, {
        size: 'sz-sm',
        interactive: cb.isMyTurn,
        affordable,
        onClick: cb.isMyTurn ? (c) => cb.onReservedCardClick(c) : undefined,
      });
      row.appendChild(el);
    }
    resSection.appendChild(row);
    container.appendChild(resSection);
  }

  // ── Nobles ──
  if (player.nobles.length > 0) {
    const nobSection = makeSection('Nobles');
    const row = document.createElement('div');
    row.className = 'my-nobles-row';
    for (const noble of player.nobles) {
      row.appendChild(renderNobleTile(noble, 'sz-sm'));
    }
    nobSection.appendChild(row);
    container.appendChild(nobSection);
  }
}

function makeSection(label: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'my-panel-section';
  const lbl = document.createElement('div');
  lbl.className = 'section-label';
  lbl.textContent = label;
  el.appendChild(lbl);
  return el;
}
