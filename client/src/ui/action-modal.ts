import type { Card, Noble, CardTier, PlayerState } from '@splendor/shared';
import { GEM_COLORS } from '@splendor/shared';
import { renderCard, renderNobleTile } from './card.js';
import { send } from '../ws-client.js';

// ─── Modal host ───────────────────────────────────────────────────────────────

let modalOverlay: HTMLElement | null = null;

function openModal(content: HTMLElement, dismissOnOutsideClick = true): void {
  closeModal();
  modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  if (dismissOnOutsideClick) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }
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

  const cardEl = renderCard(card, { size: 'sz-lg' });
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
    btn.appendChild(renderNobleTile(noble, 'sz-lg', { showRequirementNumbers: true }));
    btn.addEventListener('click', () => {
      send({ type: 'CHOOSE_NOBLE', nobleId: noble.id });
      closeModal();
    });
    row.appendChild(btn);
  }
  frag.appendChild(row);

  openModal(frag);
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
  border-radius: 16px;
  padding: clamp(28px, 3vw, 48px);
  max-width: clamp(480px, 50vw, 680px);
  width: 92%;
  display: flex; flex-direction: column; gap: 22px;
}
.modal-box h3 { color: var(--gem-gold); font-size: clamp(1.3rem, 2vw, 1.7rem); }
.modal-box p { color: var(--text-muted); font-size: clamp(0.95rem, 1.2vw, 1.1rem); line-height: 1.6; }
.modal-actions { display: flex; gap: 14px; flex-wrap: wrap; justify-content: flex-end; }
.card-modal { display: flex; flex-direction: column; gap: 22px; align-items: center; }
.picker-hint { font-size: clamp(0.9rem, 1.1vw, 1.05rem); color: var(--text-muted); text-align: center; }
.noble-choice-modal { display: flex; flex-direction: column; gap: 18px; align-items: center; }
.noble-choice-row { display: flex; gap: clamp(14px, 2vw, 24px); flex-wrap: wrap; justify-content: center; }
.noble-choice-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 12px;
  padding: 10px;
  cursor: pointer;
}
.noble-choice-btn:hover {
  border-color: var(--gem-gold);
  transform: translateY(-2px);
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
