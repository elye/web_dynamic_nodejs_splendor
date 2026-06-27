import type { Card, Noble, GemColor, GemColorOrGold, CardTier, GemPool, PlayerState } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import { renderCard, renderGemToken, renderNobleTile } from './card.js';
import { send } from '../ws-client.js';

// ─── Modal host ───────────────────────────────────────────────────────────────

let modalOverlay: HTMLElement | null = null;

function openModal(content: HTMLElement): void {
  closeModal();
  modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  const box = document.createElement('div');
  box.className = 'modal-box';
  box.appendChild(content);
  modalOverlay.appendChild(box);
  document.body.appendChild(modalOverlay);
}

export function closeModal(): void {
  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }
}

// ─── Card action modal (buy / reserve) ────────────────────────────────────────

export function openCardModal(
  card: Card,
  fromReserved: boolean,
  myPlayer: PlayerState,
): void {
  const frag = document.createElement('div');
  frag.className = 'card-modal';

  const cardEl = renderCard(card, { size: 'sz-md' });
  frag.appendChild(cardEl);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  // Buy button
  const canBuy = playerCanAfford(card, myPlayer);
  const buyBtn = document.createElement('button');
  buyBtn.className = 'btn btn-primary';
  buyBtn.textContent = 'Buy Card';
  buyBtn.disabled = !canBuy;
  buyBtn.addEventListener('click', () => {
    send({ type: 'BUY_CARD', cardId: card.id, fromReserved });
    closeModal();
  });
  actions.appendChild(buyBtn);

  // Reserve button (only for board cards, not already reserved)
  if (!fromReserved) {
    const resBtn = document.createElement('button');
    resBtn.className = 'btn btn-secondary';
    resBtn.textContent = 'Reserve';
    if (myPlayer.reservedCards.length >= 3) {
      resBtn.disabled = true;
      resBtn.title = 'Already have 3 reserved cards';
    }
    resBtn.addEventListener('click', () => {
      send({ type: 'RESERVE_CARD', cardId: card.id });
      closeModal();
    });
    actions.appendChild(resBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  actions.appendChild(cancelBtn);

  frag.appendChild(actions);
  openModal(frag);
}

// ─── Deck reserve modal ───────────────────────────────────────────────────────

export function openDeckReserveModal(tier: CardTier, myPlayer: PlayerState): void {
  const frag = document.createElement('div');
  frag.className = 'card-modal';

  const info = document.createElement('p');
  info.textContent = `Reserve a face-down Tier ${tier} card? (You won't see it until you reserve it.)`;
  frag.appendChild(info);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const resBtn = document.createElement('button');
  resBtn.className = 'btn btn-primary';
  resBtn.textContent = `Reserve from Tier ${tier}`;
  if (myPlayer.reservedCards.length >= 3) {
    resBtn.disabled = true;
    resBtn.title = 'Already have 3 reserved cards';
  }
  resBtn.addEventListener('click', () => {
    send({ type: 'RESERVE_CARD', cardId: null, tier });
    closeModal();
  });
  actions.appendChild(resBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  actions.appendChild(cancelBtn);

  frag.appendChild(actions);
  openModal(frag);
}

// ─── Gem selection modal ──────────────────────────────────────────────────────

export function openGemPickerModal(
  bankGems: GemPool,
  initialColor: GemColorOrGold,
): void {
  const selected = new Map<GemColor, number>();
  let element: HTMLElement;

  function rebuild(): void {
    element.innerHTML = '';
    renderGemPicker(element, bankGems, selected, rebuild, submitGems);
  }

  element = document.createElement('div');
  element.className = 'gem-picker-modal';

  // Add initial colour selection
  if (initialColor !== 'gold' && GEM_COLORS.includes(initialColor as GemColor)) {
    selected.set(initialColor as GemColor, 1);
  }

  rebuild();
  openModal(element);
}

function gemPickerHint(selected: Map<GemColor, number>, bank: GemPool): string {
  const total = [...selected.values()].reduce((a, b) => a + b, 0);
  const isDouble = selected.size === 1 && total === 2;

  if (total === 0) return 'Select up to 3 different colours, or 2 of the same (pile ≥ 4)';
  if (isDouble) return 'Taking 2 of the same colour — confirm or deselect to change';
  if (total === 3) return 'Maximum 3 gems selected — confirm or deselect to change';
  if (total === 2) return `${3 - total} more different colour available, or confirm`;
  return `${3 - total} more different colours available, or confirm`;
}

/** Returns true if clicking this unselected colour would be a valid addition. */
function canAddColor(color: GemColor, selected: Map<GemColor, number>, bank: GemPool): boolean {
  const total = [...selected.values()].reduce((a, b) => a + b, 0);
  const bankCount = bank[color] ?? 0;
  if (bankCount === 0) return false;
  // Already have a double — no more picks allowed
  if (selected.size === 1 && total === 2) return false;
  // Already at 3 gems total
  if (total >= 3) return false;
  return true;
}

function renderGemPicker(
  container: HTMLElement,
  bank: GemPool,
  selected: Map<GemColor, number>,
  onChange: () => void,
  onConfirm: (sel: Map<GemColor, number>) => void,
): void {
  const title = document.createElement('h3');
  title.textContent = 'Take Gems';
  container.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'picker-hint';
  hint.textContent = gemPickerHint(selected, bank);
  container.appendChild(hint);

  const grid = document.createElement('div');
  grid.className = 'picker-grid';

  for (const color of GEM_COLORS) {
    const count = bank[color] ?? 0;
    const sel = selected.get(color) ?? 0;
    const isSelected = sel > 0;

    // A token is interactive if it's already selected (click deselects)
    // or if adding it would be valid
    const interactive = isSelected || canAddColor(color, selected, bank);

    const col = document.createElement('div');
    col.className = 'picker-col';

    const token = renderGemToken(color, undefined, 'sz-lg', {
      clickable: interactive,
      selected: isSelected,
      disabled: !interactive,
      onClick: () => {
        toggleGemSelection(selected, color, bank, onChange);
      },
    });
    col.appendChild(token);

    const info = document.createElement('div');
    info.className = 'picker-info';
    info.textContent = `${count} avail${sel > 0 ? ` (−${sel})` : ''}`;
    col.appendChild(info);

    grid.appendChild(col);
  }

  container.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.textContent = 'Confirm';
  confirmBtn.disabled = selected.size === 0;
  confirmBtn.addEventListener('click', () => onConfirm(selected));
  actions.appendChild(confirmBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);
  actions.appendChild(cancelBtn);

  container.appendChild(actions);
}

function toggleGemSelection(
  selected: Map<GemColor, number>,
  color: GemColor,
  bank: GemPool,
  onChange: () => void,
): void {
  const cur = selected.get(color) ?? 0;
  const total = [...selected.values()].reduce((a, b) => a + b, 0);
  const bankCount = bank[color] ?? 0;

  if (cur === 0) {
    // Guard: only add if canAddColor allows it
    if (!canAddColor(color, selected, bank)) return;
    selected.set(color, 1);
  } else if (cur === 1) {
    // Try upgrading to double-take (only if this is the sole colour and bank has ≥4)
    if (selected.size === 1 && total === 1 && bankCount >= 4) {
      selected.set(color, 2);
    } else {
      selected.delete(color);
    }
  } else {
    // cur === 2: deselect back to 0
    selected.delete(color);
  }

  onChange();
}

function submitGems(selected: Map<GemColor, number>): void {
  const gems: GemPool = {};
  for (const [color, count] of selected) {
    gems[color] = count;
  }
  send({ type: 'TAKE_GEMS', gems });
  closeModal();
}

// ─── Discard modal ────────────────────────────────────────────────────────────

export function openDiscardModal(excess: number, myGems: GemPool): void {
  const selected = new Map<GemColorOrGold, number>();
  let element: HTMLElement;

  function rebuild(): void {
    element.innerHTML = '';
    renderDiscardPicker(element, excess, myGems, selected, rebuild);
  }

  element = document.createElement('div');
  element.className = 'gem-picker-modal discard-modal';
  rebuild();
  openModal(element);
}

// ─── Noble choice modal ──────────────────────────────────────────────────────

export function openNobleChoiceModal(nobles: Noble[]): void {
  const frag = document.createElement('div');
  frag.className = 'noble-choice-modal';

  const title = document.createElement('h3');
  title.textContent = 'Choose a Noble';
  frag.appendChild(title);

  const hint = document.createElement('p');
  hint.className = 'picker-hint';
  hint.textContent = 'You qualify for multiple nobles this turn. Pick one to claim.';
  frag.appendChild(hint);

  const row = document.createElement('div');
  row.className = 'noble-choice-row';
  for (const noble of nobles) {
    const btn = document.createElement('button');
    btn.className = 'noble-choice-btn';
    btn.type = 'button';
    btn.title = 'Choose this noble';
    btn.appendChild(renderNobleTile(noble, 'sz-sm', { showRequirementNumbers: false }));
    btn.addEventListener('click', () => {
      send({ type: 'CHOOSE_NOBLE', nobleId: noble.id });
      closeModal();
    });
    row.appendChild(btn);
  }
  frag.appendChild(row);

  openModal(frag);
}

function renderDiscardPicker(
  container: HTMLElement,
  excess: number,
  myGems: GemPool,
  selected: Map<GemColorOrGold, number>,
  onChange: () => void,
): void {
  const title = document.createElement('h3');
  title.textContent = `Discard ${excess} Gem${excess > 1 ? 's' : ''}`;
  container.appendChild(title);

  const allColors: GemColorOrGold[] = [...GEM_COLORS, 'gold'];
  const grid = document.createElement('div');
  grid.className = 'picker-grid';

  const totalSelected = [...selected.values()].reduce((a, b) => a + b, 0);

  for (const color of allColors) {
    const have = myGems[color] ?? 0;
    if (have === 0) continue;
    const sel = selected.get(color) ?? 0;

    const col = document.createElement('div');
    col.className = 'picker-col discard-picker-col';

    const token = renderGemToken(color, have, 'sz-md', {
      clickable: sel > 0 || (sel < have && totalSelected < excess),
      selected: sel > 0,
      onClick: () => {
        const cur = selected.get(color) ?? 0;
        const tot = [...selected.values()].reduce((a, b) => a + b, 0);

        if (cur > 0) {
          if (cur === 1) {
            selected.delete(color);
          } else {
            selected.set(color, cur - 1);
          }
        } else if (tot < excess) {
          selected.set(color, cur + 1);
        }

        onChange();
      },
    });
    col.appendChild(token);

    const badge = document.createElement('div');
    badge.className = `picker-info discard-badge${sel > 0 ? '' : ' is-empty'}`;
    badge.textContent = sel > 0 ? `−${sel}` : '−0';
    col.appendChild(badge);

    grid.appendChild(col);
  }
  container.appendChild(grid);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.textContent = `Discard ${totalSelected}/${excess}`;
  confirmBtn.disabled = totalSelected !== excess;
  confirmBtn.addEventListener('click', () => {
    const gems: GemPool = {};
    for (const [color, count] of selected) {
      gems[color as GemColorOrGold] = count;
    }
    send({ type: 'DISCARD_GEMS', gems });
    closeModal();
  });
  actions.appendChild(confirmBtn);
  container.appendChild(actions);
}

// ─── Modal CSS (injected at module load) ──────────────────────────────────────

const modalStyles = `
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 150;
}
.modal-box {
  background: #16261a;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 14px;
  padding: 28px;
  max-width: 420px;
  width: 90%;
  display: flex; flex-direction: column; gap: 16px;
}
.modal-box h3 { color: var(--gem-gold); font-size: 1.2rem; }
.modal-box p { color: var(--text-muted); font-size: 0.9rem; line-height: 1.5; }
.modal-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
.card-modal { display: flex; flex-direction: column; gap: 16px; align-items: center; }
.picker-hint { font-size: 0.8rem; color: var(--text-muted); text-align: center; }
.picker-grid { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
.picker-col { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.picker-info { font-size: 0.72rem; color: var(--text-muted); }
.gem-picker-modal { display: flex; flex-direction: column; gap: 16px; align-items: center; }
.discard-modal { align-items: stretch; width: 100%; }
.discard-modal .picker-grid { justify-content: space-evenly; }
.discard-modal .discard-picker-col {
  flex-direction: row;
  min-width: 64px;
  justify-content: center;
}
.discard-modal .discard-badge {
  min-width: 28px;
  text-align: left;
  font-weight: 700;
}
.discard-modal .discard-badge.is-empty {
  visibility: hidden;
}
.discard-modal .modal-actions { width: 100%; margin-top: 8px; }
.noble-choice-modal { display: flex; flex-direction: column; gap: 14px; align-items: center; }
.noble-choice-row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.noble-choice-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 10px;
  padding: 6px;
  cursor: pointer;
}
.noble-choice-btn:hover {
  border-color: var(--gem-gold);
  transform: translateY(-1px);
}
`;

const styleEl = document.createElement('style');
styleEl.textContent = modalStyles;
document.head.appendChild(styleEl);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function playerCanAfford(card: Card, player: PlayerState): boolean {
  let goldNeeded = 0;
  for (const color of GEM_COLORS) {
    const raw = card.cost[color] ?? 0;
    const bonus = player.bonuses[color] ?? 0;
    const have = player.gems[color] ?? 0;
    goldNeeded += Math.max(0, raw - bonus - have);
  }
  return goldNeeded <= (player.gems['gold'] ?? 0);
}
