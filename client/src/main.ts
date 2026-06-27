import './styles/base.css';
import './styles/tokens.css';
import './styles/cards.css';
import './styles/board.css';
import './styles/panels.css';

import { connect, onMessage, send } from './ws-client.js';
import { setPlayerId, setRoom, setGame, getState, subscribe } from './state.js';
import type { AppState } from './state.js';
import { renderLobby } from './ui/lobby.js';
import { renderBoard, renderBankPanel } from './ui/board.js';
import { renderOpponentStrip, renderMyPanel } from './ui/player-panel.js';
import {
  openCardModal,
  openDeckReserveModal,
  openDiscardModal,
  closeModal,
} from './ui/action-modal.js';
import { GEM_COLORS } from '@splendor/shared';
import type { GemColor, GemColorOrGold, GemPool, Card, CardTier } from '@splendor/shared';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>('#app')!;

connect();

onMessage((msg) => {
  switch (msg.type) {
    case 'YOUR_ID':    setPlayerId(msg.playerId); break;
    case 'ROOM_UPDATE': setRoom(msg.room); break;
    case 'GAME_STATE': {
      setGame(msg.state);
      // If there's a pending discard for the local player, show modal
      const { myPlayerId } = getState();
      const discard = msg.state.pendingDiscard;
      if (discard && discard.playerId === myPlayerId) {
        openDiscardModal(discard.excess, msg.state.players.find(p => p.id === myPlayerId)?.gems ?? {});
      } else {
        closeModal();
      }
      break;
    }
    case 'ERROR':
      console.error(`[server error] ${msg.code}: ${msg.message}`);
      // Show brief error toast
      showToast(msg.message, 'error');
      break;
  }
});

// ─── Render router ────────────────────────────────────────────────────────────

function render(state: AppState): void {
  if (state.screen === 'lobby') {
    lastTurnToastKey = null;
    app.innerHTML = '';
    app.className = '';
    const lobbyEl = document.createElement('div');
    lobbyEl.className = 'lobby-screen';
    app.appendChild(lobbyEl);
    renderLobby(lobbyEl);
    return;
  }

  if (state.screen === 'game' && state.game) {
    renderGameScreen(state);
  }
}

// ─── Game screen ──────────────────────────────────────────────────────────────

// Track selected gems across renders (persists during a turn)
const selectedGems = new Map<GemColorOrGold, number>();
let lastTurnToastKey: string | null = null;

subscribe(render);
render(getState());

function selectedGemTotal(selection: Map<GemColorOrGold, number>): number {
  return [...selection.values()].reduce((sum, count) => sum + count, 0);
}

function canAddGemColor(
  color: GemColor,
  selection: Map<GemColorOrGold, number>,
  bank: GemPool,
): boolean {
  const total = selectedGemTotal(selection);
  const bankCount = bank[color] ?? 0;

  if (bankCount === 0) return false;
  if (selection.size === 1 && total === 2) return false;
  if (total >= 3) return false;

  return true;
}

function toggleBankGemSelection(color: GemColorOrGold, bank: GemPool): void {
  if (color === 'gold') return;

  const current = selectedGems.get(color) ?? 0;
  const total = selectedGemTotal(selectedGems);
  const bankCount = bank[color] ?? 0;

  if (current === 0) {
    if (!canAddGemColor(color, selectedGems, bank)) return;
    selectedGems.set(color, 1);
    return;
  }

  if (current === 1) {
    if (selectedGems.size === 1 && total === 1 && bankCount >= 4) {
      selectedGems.set(color, 2);
    } else {
      selectedGems.delete(color);
    }
    return;
  }

  selectedGems.set(color, 1);
}

function sanitizeBankSelection(bank: GemPool): void {
  for (const [color, count] of [...selectedGems.entries()]) {
    if (color === 'gold') {
      selectedGems.delete(color);
      continue;
    }

    const available = bank[color] ?? 0;
    if (available <= 0) {
      selectedGems.delete(color);
      continue;
    }

    if (count > available) {
      selectedGems.set(color, available);
    }

    if ((selectedGems.get(color) ?? 0) > 1 && (available < 4 || selectedGems.size > 1)) {
      selectedGems.set(color, 1);
    }
  }
}

function bankSelectionHint(selection: Map<GemColorOrGold, number>, bank: GemPool): string {
  const total = selectedGemTotal(selection);
  const isDouble = selection.size === 1 && total === 2;

  if (total === 0) return 'Pick up to 3 colours, or double one colour (4+ in bank).';
  if (isDouble) return 'Double pick ready. Click Take Selected, or click again to remove.';
  if (total === 3) return 'Max selected. Take now or click a gem to change.';

  const singleColor = [...selection.keys()][0] as GemColorOrGold | undefined;
  if (singleColor && singleColor !== 'gold') {
    const canDouble = (bank[singleColor] ?? 0) >= 4;
    if (total === 1 && canDouble) {
      return 'Click same gem again for x2, or add different colours.';
    }
  }

  return `${3 - total} more colour${total === 2 ? '' : 's'} possible, or Take Selected.`;
}

function sendTakeSelectedGems(): void {
  const gems: GemPool = {};
  for (const color of GEM_COLORS) {
    const count = selectedGems.get(color) ?? 0;
    if (count > 0) gems[color] = count;
  }
  if (Object.keys(gems).length === 0) return;
  send({ type: 'TAKE_GEMS', gems });
  selectedGems.clear();
}

function renderGameScreen(state: AppState): void {
  const { game, myPlayerId } = state;
  if (!game) return;

  app.className = '';
  app.innerHTML = '';

  const myPlayer = game.players.find(p => p.id === myPlayerId) ?? null;
  const myIndex = game.players.findIndex(p => p.id === myPlayerId);
  const isMyTurn = game.phase === 'playing' && game.currentPlayerIndex === myIndex && !game.pendingDiscard;
  const opponents = game.players.filter(p => p.id !== myPlayerId);

  if (!isMyTurn) {
    selectedGems.clear();
  } else {
    sanitizeBankSelection(game.bank);
  }

  // Game over overlay
  if (game.phase === 'finished') {
    const overlay = document.createElement('div');
    overlay.className = 'game-over-overlay';
    const card = document.createElement('div');
    card.className = 'game-over-card';
    const title = document.createElement('div');
    title.className = 'game-over-title';
    title.textContent = 'Game Over';
    const winnersEl = document.createElement('div');
    winnersEl.className = 'game-over-winners';
    const winners = game.players.filter(p => game.winnerIds?.includes(p.id));
    winnersEl.textContent = winners.length === 1
      ? `🏆 ${winners[0].name} wins with ${winners[0].points} points!`
      : `🏆 Tie: ${winners.map(w => w.name).join(' & ')}`;
    card.appendChild(title);
    card.appendChild(winnersEl);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  // Layout shell
  const layout = document.createElement('div');
  layout.className = 'game-layout';

  // ── Opponents bar ──
  const opponentsBar = document.createElement('div');
  opponentsBar.className = 'opponents-bar';
  for (const opp of opponents) {
    const isTurn = game.players.indexOf(opp) === game.currentPlayerIndex;
    opponentsBar.appendChild(renderOpponentStrip(opp, isTurn));
  }
  layout.appendChild(opponentsBar);

  // ── Centre: board + bank ──
  const center = document.createElement('div');
  center.className = 'game-center';

  const boardArea = document.createElement('div');
  renderBoard(boardArea, game, {
    myPlayer,
    isMyTurn,
    onCardClick: (card: Card, fromReserved = false) => {
      if (!myPlayer) return;
      openCardModal(card, fromReserved, myPlayer);
    },
    onDeckClick: (tier: CardTier) => {
      if (!myPlayer) return;
      openDeckReserveModal(tier, myPlayer);
    },
    onGemClick: () => {},
  });
  center.appendChild(boardArea);

  const bankPanel = document.createElement('div');
  renderBankPanel(bankPanel, game, {
    isMyTurn,
    onGemClick: (color: GemColorOrGold) => {
      if (!isMyTurn) return;
      toggleBankGemSelection(color, game.bank);
      render(getState());
    },
    onConfirmTakeGems: () => {
      if (!isMyTurn) return;
      sendTakeSelectedGems();
    },
    onClearGemSelection: () => {
      selectedGems.clear();
      render(getState());
    },
  }, selectedGems, bankSelectionHint(selectedGems, game.bank));
  center.appendChild(bankPanel);

  layout.appendChild(center);

  // ── My panel bar ──
  const myPanelBar = document.createElement('div');
  myPanelBar.className = `my-panel-bar${isMyTurn ? ' my-turn' : ''}`;

  if (isMyTurn) {
    const turnLabel = document.createElement('div');
    turnLabel.className = 'my-turn-label';
    turnLabel.textContent = 'Your Turn';
    myPanelBar.appendChild(turnLabel);
  }

  const myPanelEl = document.createElement('div');
  if (myPlayer) {
    renderMyPanel(myPanelEl, myPlayer, {
      isMyTurn,
      canAfford: (card) => {
        let gold = 0;
        for (const c of ['white','blue','green','red','black'] as const) {
          const needed = Math.max(0, (card.cost[c] ?? 0) - (myPlayer.bonuses[c] ?? 0) - (myPlayer.gems[c] ?? 0));
          gold += needed;
        }
        return gold <= (myPlayer.gems['gold'] ?? 0);
      },
      onReservedCardClick: (card) => openCardModal(card, true, myPlayer),
    });
  }
  myPanelBar.appendChild(myPanelEl);
  layout.appendChild(myPanelBar);

  app.appendChild(layout);

  // Turn toast
  if (game.phase === 'playing') {
    const current = game.players[game.currentPlayerIndex];
    if (current) {
      const toastKey = `${game.roomCode}:${game.phase}:${current.id}`;
      if (toastKey !== lastTurnToastKey) {
        const isMe = current.id === myPlayerId;
        showTurnToast(isMe ? 'Your turn!' : `${current.name}'s turn`);
        lastTurnToastKey = toastKey;
      }
    }
  } else {
    lastTurnToastKey = null;
  }
}

// ─── Toast helpers ────────────────────────────────────────────────────────────

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function showTurnToast(msg: string): void {
  const existing = document.querySelector('.turn-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'turn-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 2500);
}

function showToast(msg: string, type: 'error' | 'info' = 'info'): void {
  const toast = document.createElement('div');
  toast.className = 'turn-toast';
  toast.style.background = type === 'error' ? 'var(--gem-red)' : 'var(--gem-gold)';
  toast.style.color = '#fff';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

