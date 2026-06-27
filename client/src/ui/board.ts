import type { GameState, Card, CardTier, GemColor, GemColorOrGold, PlayerState } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import { renderCard, renderDeckPlaceholder, renderNobleTile, renderGemToken } from './card.js';

export interface BoardCallbacks {
  onCardClick: (card: Card, fromReserved?: boolean) => void;
  onDeckClick: (tier: CardTier) => void;
  onGemClick: (color: GemColorOrGold) => void;
  myPlayer: PlayerState | null;
  isMyTurn: boolean;
}

// ─── Main board renderer ──────────────────────────────────────────────────────

export function renderBoard(container: HTMLElement, state: GameState, cb: BoardCallbacks): void {
  container.innerHTML = '';
  container.className = 'board-area';

  // Noble row (tier 3 top, then 2, then 1 — nobles at very top)
  const nobleRow = document.createElement('div');
  nobleRow.className = 'noble-row';
  for (const noble of state.nobles) {
    nobleRow.appendChild(renderNobleTile(noble, 'sz-md'));
  }
  container.appendChild(nobleRow);

  // Tier rows: 3, 2, 1 top-to-bottom
  for (const tierNum of [3, 2, 1] as CardTier[]) {
    const tierState = state.tiers[tierNum - 1];
    const row = document.createElement('div');
    row.className = 'tier-row';

    // Deck
    const deckEl = renderDeckPlaceholder(
      tierNum,
      tierState.deckCount,
      'sz-md',
      cb.isMyTurn,
      () => cb.onDeckClick(tierNum),
    );
    row.appendChild(deckEl);

    // Face-up cards
    for (const card of tierState.faceUp) {
      if (!card) {
        const empty = document.createElement('div');
        empty.className = `splendor-card tier-${tierNum} sz-md`;
        empty.style.opacity = '0.2';
        row.appendChild(empty);
      } else {
        const affordable = cb.myPlayer ? canAfford(card, cb.myPlayer) : false;
        const cardEl = renderCard(card, {
          size: 'sz-md',
          interactive: cb.isMyTurn,
          affordable: !cb.myPlayer || affordable,
          onClick: cb.isMyTurn ? (c) => cb.onCardClick(c) : undefined,
        });
        row.appendChild(cardEl);
      }
    }

    container.appendChild(row);
  }
}

// ─── Gem bank panel ───────────────────────────────────────────────────────────

export function renderBankPanel(
  container: HTMLElement,
  state: GameState,
  cb: BoardCallbacks,
  selectedGems: Map<GemColorOrGold, number>,
): void {
  container.innerHTML = '';
  container.className = 'bank-panel';

  const title = document.createElement('div');
  title.className = 'bank-title';
  title.textContent = 'Gem Bank';
  container.appendChild(title);

  const gemsCol = document.createElement('div');
  gemsCol.className = 'bank-gems';

  const allColors: GemColorOrGold[] = [...GEM_COLORS, 'gold'];

  for (const color of allColors) {
    const count = state.bank[color] ?? 0;
    const isSelected = (selectedGems.get(color) ?? 0) > 0;

    const row = document.createElement('div');
    row.className = 'bank-gem-row';

    const token = renderGemToken(color, count, 'sz-md', {
      clickable: cb.isMyTurn && color !== 'gold' && count > 0,
      selected: isSelected,
      disabled: count === 0,
      onClick: () => cb.onGemClick(color),
    });
    row.appendChild(token);

    if (color === 'gold') {
      const label = document.createElement('span');
      label.className = 'bank-gem-label';
      label.textContent = 'Reserve';
      row.appendChild(label);
    }

    gemsCol.appendChild(row);
  }

  container.appendChild(gemsCol);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function canAfford(card: Card, player: PlayerState): boolean {
  let goldNeeded = 0;
  for (const color of GEM_COLORS) {
    const raw = card.cost[color] ?? 0;
    const bonus = player.bonuses[color] ?? 0;
    const have = player.gems[color] ?? 0;
    const needed = Math.max(0, raw - bonus - have);
    goldNeeded += needed;
  }
  return goldNeeded <= (player.gems['gold'] ?? 0);
}
