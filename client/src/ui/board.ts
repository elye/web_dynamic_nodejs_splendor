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

export interface BankCallbacks {
  onGemClick: (color: GemColorOrGold) => void;
  onConfirmTakeGems: () => void;
  onClearGemSelection: () => void;
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
    row.className = `tier-row tier-row-${tierNum}`;

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
  cb: BankCallbacks,
  selectedGems: Map<GemColorOrGold, number>,
  selectionHint: string,
): void {
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;

  container.innerHTML = '';
  container.className = 'bank-panel';

  const title = document.createElement('div');
  title.className = 'bank-title';
  title.textContent = 'Gem Bank';
  container.appendChild(title);

  const primaryRow = document.createElement('div');
  primaryRow.className = 'bank-row bank-row-primary';

  const selectGems = document.createElement('div');
  selectGems.className = 'bank-select-gems';

  for (const color of GEM_COLORS) {
    const count = state.bank[color] ?? 0;
    const selectedCount = selectedGems.get(color) ?? 0;
    const isSelected = selectedCount > 0;

    const item = document.createElement('div');
    item.className = 'bank-gem-item';

    const token = renderGemToken(color, count, 'sz-md', {
      clickable: cb.isMyTurn && count > 0,
      selected: isSelected,
      disabled: count === 0,
      onClick: () => cb.onGemClick(color),
    });
    item.appendChild(token);

    const multi = document.createElement('span');
    multi.className = `bank-gem-multi${selectedCount > 0 ? '' : ' is-empty'}`;
    multi.textContent = selectedCount > 0 ? `x${selectedCount}` : 'x0';
    item.appendChild(multi);

    selectGems.appendChild(item);
  }

  primaryRow.appendChild(selectGems);

  const actions = document.createElement('div');
  actions.className = 'bank-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-primary btn-sm';
  confirmBtn.textContent = 'Take Selected';
  confirmBtn.disabled = !cb.isMyTurn || selectedGems.size === 0;
  confirmBtn.addEventListener('click', cb.onConfirmTakeGems);
  actions.appendChild(confirmBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-secondary btn-sm';
  clearBtn.textContent = 'Clear';
  clearBtn.disabled = selectedGems.size === 0;
  clearBtn.addEventListener('click', cb.onClearGemSelection);
  actions.appendChild(clearBtn);

  primaryRow.appendChild(actions);
  container.appendChild(primaryRow);

  const secondaryRow = document.createElement('div');
  secondaryRow.className = 'bank-row bank-row-secondary';

  const reserveInfo = document.createElement('div');
  reserveInfo.className = 'bank-reserve-info';
  const goldCount = state.bank.gold ?? 0;
  reserveInfo.appendChild(
    renderGemToken('gold', goldCount, 'sz-md', {
      clickable: false,
      selected: false,
      disabled: goldCount === 0,
    }),
  );
  const reserveLabel = document.createElement('span');
  reserveLabel.className = 'bank-gem-label';
  reserveLabel.textContent = 'Reserve';
  reserveInfo.appendChild(reserveLabel);

  if (isPortrait) {
    primaryRow.appendChild(reserveInfo);
    secondaryRow.appendChild(actions);
  } else {
    secondaryRow.appendChild(reserveInfo);
    secondaryRow.appendChild(actions);
  }

  const hint = document.createElement('div');
  hint.className = 'bank-selection-hint';
  hint.textContent = selectionHint;
  secondaryRow.appendChild(hint);

  container.appendChild(secondaryRow);
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
