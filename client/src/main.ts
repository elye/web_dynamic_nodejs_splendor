import './styles/base.css';
import './styles/tokens.css';
import './styles/cards.css';
import './styles/board.css';
import './styles/panels.css';

import { connect, onMessage, send, waitForOpen } from './ws-client.js';
import { startKeepAlive, stopKeepAlive } from './keep-alive.js';
import { setPlayerId, setPlayerName, setRoom, setGame, getState, subscribe, saveSession, loadSession, clearSession, resetToLobby } from './state.js';
import type { AppState } from './state.js';
import { renderLobby } from './ui/lobby.js';
import { renderBoard, renderBankPanel } from './ui/board.js';
import { renderOpponentStrip, renderMyPanel } from './ui/player-panel.js';
import {
  openCardModal,
  openDeckReserveModal,
  openNobleChoiceModal,
  closeModal,
} from './ui/action-modal.js';
import { GEM_COLORS } from '@splendor/shared';
import type { GemColor, GemColorOrGold, GemPool, Card, CardTier } from '@splendor/shared';

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>('#app')!;
let fullscreenToggleBtn: HTMLButtonElement | null = null;

document.addEventListener('fullscreenchange', () => {
  updateFullscreenToggleLabel();
});

connect();

// ─── Auto-reconnect on page load ─────────────────────────────────────────────

const urlRoomCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? null;
const savedSession = loadSession();

// If the URL contains a room code and we have a saved session for that room,
// send RECONNECT_ROOM once the WebSocket is open.
if (urlRoomCode && savedSession && savedSession.roomCode === urlRoomCode) {
  // Wait for the socket 'open' event then send the reconnect message
  const tryReconnect = (): void => {
    send({ type: 'RECONNECT_ROOM', roomCode: urlRoomCode, playerId: savedSession.playerId, playerName: savedSession.playerName });
  };
  // onMessage fires synchronously for YOUR_ID right after open; we hook into
  // a small helper that fires once the socket is confirmed open.
  waitForOpen(tryReconnect);
}

onMessage((msg) => {
  switch (msg.type) {
    case 'YOUR_ID': {
      setPlayerId(msg.playerId);
      // Restore player name from session (needed so ROOM_UPDATE can call saveSession)
      const sess = loadSession();
      if (sess && msg.playerId === sess.playerId) {
        setPlayerName(sess.playerName);
      }
      break;
    }
    case 'ROOM_UPDATE': {
      setRoom(msg.room);
      // Push the room code into the URL (idempotent if already there)
      const code = msg.room.roomCode;
      const current = new URLSearchParams(location.search).get('room')?.toUpperCase();
      if (current !== code) {
        const url = new URL(location.href);
        url.searchParams.set('room', code);
        history.replaceState(null, '', url.toString());
      }
      // Persist the session so a refresh can reconnect
      const s = getState();
      if (s.myPlayerId && s.myPlayerName) {
        saveSession(s.myPlayerId, s.myPlayerName, code);
      }
      break;
    }
    case 'GAME_STATE': {
      setGame(msg.state);
      // Keep session fresh with the latest room code from game state
      {
        const s = getState();
        if (s.myPlayerId && s.myPlayerName && msg.state.roomCode) {
          saveSession(s.myPlayerId, s.myPlayerName, msg.state.roomCode);
          // Keep URL in sync too
          const current = new URLSearchParams(location.search).get('room')?.toUpperCase();
          if (current !== msg.state.roomCode) {
            const url = new URL(location.href);
            url.searchParams.set('room', msg.state.roomCode);
            history.replaceState(null, '', url.toString());
          }
        }
      }
      // Noble choice still uses a modal (it needs full attention & is short).
      // Discard is handled INLINE via the my-panel bar so the player can still
      // see the board / cards / opponents while deciding what to drop.
      const { myPlayerId } = getState();
      const discard = msg.state.pendingDiscard;
      const nobleChoice = msg.state.pendingNobleChoice;
      // Reset the inline discard selection whenever discard state changes owner
      // or clears, so it never leaks across turns/players.
      if (!discard || discard.playerId !== myPlayerId) {
        discardSelection.clear();
      }
      if (nobleChoice && nobleChoice.playerId === myPlayerId) {
        openNobleChoiceModal(nobleChoice.nobles);
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
    stopKeepAlive();
    removeFullscreenToggle();
    void exitFullscreenIfNeeded();
    lastTurnToastKey = null;
    // If we reach the entry screen (no room), clear session + URL so a refresh
    // doesn't try to reconnect to a gone room.
    if (!state.room) {
      clearSession();
      if (location.search) {
        history.replaceState(null, '', location.pathname);
      }
    }
    app.innerHTML = '';
    app.className = '';
    const lobbyEl = document.createElement('div');
    lobbyEl.className = 'lobby-screen';
    app.appendChild(lobbyEl);
    renderLobby(lobbyEl);
    return;
  }

  if (state.screen === 'game' && state.game) {
    startKeepAlive();
    ensureFullscreenToggle();
    renderGameScreen(state);
  }
}

// ─── Game screen ──────────────────────────────────────────────────────────────

// Track selected gems across renders (persists during a turn)
const selectedGems = new Map<GemColorOrGold, number>();
// Track gems selected for inline discard (used when pendingDiscard targets us)
const discardSelection = new Map<GemColorOrGold, number>();
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

// ─── Inline discard flow ─────────────────────────────────────────────────────

function toggleDiscardGem(color: GemColorOrGold, myGems: GemPool, excess: number): void {
  const have = myGems[color] ?? 0;
  if (have === 0) return;
  const cur = discardSelection.get(color) ?? 0;
  const totalOther = [...discardSelection.entries()]
    .filter(([c]) => c !== color)
    .reduce((s, [, n]) => s + n, 0);
  const room = excess - totalOther;
  // Cycle: 0 → 1 → 2 → ... → min(have, room) → 0
  const max = Math.min(have, room);
  if (cur >= max) {
    discardSelection.delete(color);
  } else {
    discardSelection.set(color, cur + 1);
  }
}

function sendDiscardSelection(): void {
  const gems: GemPool = {};
  for (const [color, count] of discardSelection) {
    if (count > 0) gems[color] = count;
  }
  if (Object.keys(gems).length === 0) return;
  send({ type: 'DISCARD_GEMS', gems });
  discardSelection.clear();
}

function renderGameScreen(state: AppState): void {
  const { game, myPlayerId } = state;
  if (!game) return;

  app.className = '';
  app.innerHTML = '';

  const myPlayer = game.players.find(p => p.id === myPlayerId) ?? null;
  const myIndex = game.players.findIndex(p => p.id === myPlayerId);
  const hasPendingGate = Boolean(game.pendingDiscard || game.pendingNobleChoice);
  const isMyTurn = game.phase === 'playing' && game.currentPlayerIndex === myIndex && !hasPendingGate;
  const opponents = game.players.filter(p => p.id !== myPlayerId);

  if (!isMyTurn) {
    selectedGems.clear();
  } else {
    sanitizeBankSelection(game.bank);
  }

  // Sanitize inline discard selection against the latest hand + excess
  if (game.pendingDiscard && game.pendingDiscard.playerId === myPlayerId && myPlayer) {
    let running = 0;
    for (const [color, count] of [...discardSelection.entries()]) {
      const have = myPlayer.gems[color] ?? 0;
      const room = game.pendingDiscard.excess - running;
      const clamped = Math.min(count, have, Math.max(0, room));
      if (clamped <= 0) discardSelection.delete(color);
      else discardSelection.set(color, clamped);
      running += clamped;
    }
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
    card.appendChild(title);

    // Ranked leaderboard
    const sorted = [...game.players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      // Tiebreak: fewer owned cards wins
      return a.ownedCards.length - b.ownedCards.length;
    });
    const isWinner = (p: (typeof sorted)[number]) => game.winnerIds?.includes(p.id) ?? false;

    const leaderboard = document.createElement('ol');
    leaderboard.className = 'game-over-leaderboard';
    sorted.forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'leaderboard-row' + (isWinner(p) ? ' leaderboard-winner' : '');

      const rankEl = document.createElement('span');
      rankEl.className = 'lb-rank';
      rankEl.textContent = isWinner(p) ? '🏆' : `#${idx + 1}`;

      const nameEl = document.createElement('span');
      nameEl.className = 'lb-name';
      if (p.type === 'ai') {
        const icon = document.createElement('span');
        icon.textContent = '🤖';
        icon.className = 'ai-icon';
        nameEl.appendChild(icon);
      }
      nameEl.appendChild(document.createTextNode(p.name));

      const ptsEl = document.createElement('span');
      ptsEl.className = 'lb-pts';
      ptsEl.textContent = `${p.points} pts`;

      li.appendChild(rankEl);
      li.appendChild(nameEl);
      li.appendChild(ptsEl);
      leaderboard.appendChild(li);
    });
    card.appendChild(leaderboard);

    const newGameBtn = document.createElement('button');
    newGameBtn.type = 'button';
    newGameBtn.className = 'btn btn-primary game-over-new-game-btn';
    newGameBtn.textContent = '🏠 New Game';
    newGameBtn.addEventListener('click', () => goToLobby());
    card.appendChild(newGameBtn);

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
  const leaveBtn = document.createElement('button');
  leaveBtn.type = 'button';
  leaveBtn.className = 'btn btn-danger leave-game-btn';
  leaveBtn.textContent = '✕ Leave';
  leaveBtn.title = 'Leave game and return to lobby';
  leaveBtn.addEventListener('click', () => {
    if (game.phase === 'finished' || confirm('Leave the current game and return to the lobby?')) {
      goToLobby();
    }
  });
  opponentsBar.appendChild(leaveBtn);

  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className = 'btn btn-secondary fullscreen-toggle-btn';
  fsBtn.textContent = document.fullscreenElement ? 'Exit ⛶' : 'Full ⛶';
  fsBtn.addEventListener('click', () => { void toggleFullscreen(); });
  fullscreenToggleBtn = fsBtn;
  opponentsBar.appendChild(fsBtn);
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
  const isPendingDiscardMine = Boolean(
    game.pendingDiscard && game.pendingDiscard.playerId === myPlayerId,
  );
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
    discardMode: isPendingDiscardMine && game.pendingDiscard && myPlayer
      ? {
          excess: game.pendingDiscard.excess,
          myGems: myPlayer.gems,
          selection: discardSelection,
          onGemClick: (color) => {
            if (!game.pendingDiscard || !myPlayer) return;
            toggleDiscardGem(color, myPlayer.gems, game.pendingDiscard.excess);
            render(getState());
          },
          onConfirm: () => {
            sendDiscardSelection();
            render(getState());
          },
          onReset: () => {
            discardSelection.clear();
            render(getState());
          },
        }
      : undefined,
  }, selectedGems, bankSelectionHint(selectedGems, game.bank));
  center.appendChild(bankPanel);

  layout.appendChild(center);

  // ── My panel bar ──
  const myPanelBar = document.createElement('div');
  myPanelBar.className = `my-panel-bar${isMyTurn ? ' my-turn' : ''}`;

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

// ─── Fullscreen helpers ──────────────────────────────────────────────────────

function ensureFullscreenToggle(): void {
  // Button is built inline inside renderGameScreen's opponents bar.
}

function removeFullscreenToggle(): void {
  fullscreenToggleBtn = null;
}

function updateFullscreenToggleLabel(): void {
  if (!fullscreenToggleBtn) return;
  fullscreenToggleBtn.textContent = document.fullscreenElement ? 'Exit ⛶' : 'Full ⛶';
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await exitFullscreenIfNeeded();
    return;
  }

  try {
    await document.documentElement.requestFullscreen();
  } catch (err) {
    console.warn('[fullscreen] request failed', err);
  }
}

async function exitFullscreenIfNeeded(): Promise<void> {
  if (!document.fullscreenElement) return;
  try {
    await document.exitFullscreen();
  } catch (err) {
    console.warn('[fullscreen] exit failed', err);
  }
}

// ─── Leave / lobby helpers ────────────────────────────────────────────────────

function goToLobby(): void {
  clearSession();
  if (location.search) history.replaceState(null, '', location.pathname);
  void exitFullscreenIfNeeded();
  // Remove any lingering game-over overlay
  document.querySelector('.game-over-overlay')?.remove();
  resetToLobby();
}

