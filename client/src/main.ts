import './styles/base.css';
import './styles/tokens.css';
import './styles/cards.css';
import './styles/board.css';
import './styles/panels.css';

import { connect, onMessage } from './ws-client.js';
import { setPlayerId, setRoom, setGame, getState, subscribe } from './state.js';
import type { AppState } from './state.js';
import { renderLobby } from './ui/lobby.js';
import { renderBoard, renderBankPanel } from './ui/board.js';
import { renderOpponentStrip, renderMyPanel } from './ui/player-panel.js';
import {
  openCardModal,
  openDeckReserveModal,
  openGemPickerModal,
  openDiscardModal,
  closeModal,
} from './ui/action-modal.js';
import type { GemColorOrGold, Card, CardTier } from '@splendor/shared';

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

subscribe(render);
render(getState());

// ─── Render router ────────────────────────────────────────────────────────────

function render(state: AppState): void {
  if (state.screen === 'lobby') {
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

function renderGameScreen(state: AppState): void {
  const { game, myPlayerId } = state;
  if (!game) return;

  app.className = '';
  app.innerHTML = '';

  const myPlayer = game.players.find(p => p.id === myPlayerId) ?? null;
  const myIndex = game.players.findIndex(p => p.id === myPlayerId);
  const isMyTurn = game.phase === 'playing' && game.currentPlayerIndex === myIndex && !game.pendingDiscard;
  const opponents = game.players.filter(p => p.id !== myPlayerId);

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
    onGemClick: (color: GemColorOrGold) => {
      if (!isMyTurn) return;
      openGemPickerModal(game.bank, color);
    },
  });
  center.appendChild(boardArea);

  const bankPanel = document.createElement('div');
  renderBankPanel(bankPanel, game, {
    myPlayer,
    isMyTurn,
    onCardClick: () => {},
    onDeckClick: () => {},
    onGemClick: (color: GemColorOrGold) => {
      if (!isMyTurn) return;
      openGemPickerModal(game.bank, color);
    },
  }, selectedGems);
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
      const isMe = current.id === myPlayerId;
      showTurnToast(isMe ? 'Your turn!' : `${current.name}'s turn`);
    }
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

