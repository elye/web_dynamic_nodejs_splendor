import type { GameState, Card, CardTier, GemColor, GemColorOrGold, GemPool, PlayerState } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import { renderCard, renderDeckPlaceholder, renderNobleTile, renderGemToken } from './card.js';

export interface BoardCallbacks {
  onCardClick: (card: Card, fromReserved?: boolean) => void;
  onDeckClick: (tier: CardTier) => void;
  onGemClick: (color: GemColorOrGold) => void;
  myPlayer: PlayerState | null;
  isMyTurn: boolean;
}

/**
 * Discard mode transforms the bank panel into a picker over the player's own
 * gems, so they can decide which to drop while still seeing the board.
 */
export interface BankDiscardMode {
  excess: number;
  myGems: GemPool;
  selection: Map<GemColorOrGold, number>;
  onGemClick: (color: GemColorOrGold) => void;
  onConfirm: () => void;
  onReset: () => void;
}

export interface BankCallbacks {
  onGemClick: (color: GemColorOrGold) => void;
  onConfirmTakeGems: () => void;
  onClearGemSelection: () => void;
  isMyTurn: boolean;
  discardMode?: BankDiscardMode;
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
  container.innerHTML = '';

  // Discard mode fully replaces the bank UI — the same panel becomes a picker
  // over the player's own gems, so the board / cards stay visible.
  if (cb.discardMode) {
    container.className = 'bank-panel discard-mode';
    renderDiscardBank(container, cb.discardMode);
    return;
  }

  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
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

// ─── Discard mode: repurpose the bank panel as a discard picker ──────────────

function renderDiscardBank(container: HTMLElement, mode: BankDiscardMode): void {
  const allColors: GemColorOrGold[] = [...GEM_COLORS, 'gold'];
  const totalSelected = [...mode.selection.values()].reduce((a, b) => a + b, 0);
  const remaining = mode.excess - totalSelected;

  // Header — clearly not a bank anymore: red glyph + "Discard N/M".
  const title = document.createElement('div');
  title.className = 'bank-title discard-title';
  const icon = document.createElement('span');
  icon.className = 'discard-title-icon';
  icon.textContent = '⚠';
  title.appendChild(icon);
  const titleText = document.createElement('span');
  titleText.className = 'discard-title-text';
  titleText.textContent = `Discard ${totalSelected}/${mode.excess}`;
  title.appendChild(titleText);
  const titleSub = document.createElement('span');
  titleSub.className = 'discard-title-sub';
  titleSub.textContent = 'Over the 10-gem limit';
  title.appendChild(titleSub);
  container.appendChild(title);

  // Gem grid — player's OWN gems. Zero-count colours are omitted so the row
  // stays tidy on landscape (vertical) and phone portrait (5-col grid).
  const primaryRow = document.createElement('div');
  primaryRow.className = 'bank-row bank-row-primary';

  const grid = document.createElement('div');
  grid.className = 'bank-select-gems discard-gems';

  const visibleColors = allColors.filter((c) => (mode.myGems[c] ?? 0) > 0);
  for (const color of visibleColors) {
    const have = mode.myGems[color] ?? 0;
    const sel = mode.selection.get(color) ?? 0;
    const isSelected = sel > 0;
    // A gem is clickable if we still have room to add OR the player wants
    // to cycle back down (deselect the last tick of this colour).
    const canAdd = sel < have && remaining > 0;
    const canClick = canAdd || sel > 0;

    const item = document.createElement('div');
    item.className = `bank-gem-item discard-gem-item${isSelected ? ' is-selected' : ''}`;

    const token = renderGemToken(color, have, 'sz-md', {
      clickable: canClick,
      selected: isSelected,
      disabled: !canClick,
      onClick: canClick ? () => mode.onGemClick(color) : undefined,
    });
    item.appendChild(token);

    const badge = document.createElement('span');
    badge.className = `bank-gem-multi discard-badge${isSelected ? '' : ' is-empty'}`;
    badge.textContent = isSelected ? `−${sel}` : '−0';
    item.appendChild(badge);

    grid.appendChild(item);
  }
  primaryRow.appendChild(grid);
  container.appendChild(primaryRow);

  // Actions + hint row
  const secondaryRow = document.createElement('div');
  secondaryRow.className = 'bank-row bank-row-secondary';

  const actions = document.createElement('div');
  actions.className = 'bank-actions discard-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger btn-sm discard-confirm-btn';
  confirmBtn.textContent = `Confirm Discard (${totalSelected}/${mode.excess})`;
  confirmBtn.disabled = totalSelected !== mode.excess;
  confirmBtn.addEventListener('click', () => mode.onConfirm());
  actions.appendChild(confirmBtn);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-secondary btn-sm discard-reset-btn';
  resetBtn.textContent = 'Reset';
  resetBtn.disabled = totalSelected === 0;
  resetBtn.addEventListener('click', () => mode.onReset());
  actions.appendChild(resetBtn);

  secondaryRow.appendChild(actions);

  const hint = document.createElement('div');
  hint.className = 'bank-selection-hint discard-hint';
  hint.textContent = totalSelected === mode.excess
    ? 'Ready — tap Confirm Discard.'
    : totalSelected === 0
      ? `Pick ${mode.excess} gem${mode.excess > 1 ? 's' : ''} to drop. Tap a gem to add, tap again to remove.`
      : `Pick ${remaining} more gem${remaining > 1 ? 's' : ''}, or tap a selected gem to remove.`;
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
