import type { AiDifficulty } from '@splendor/shared';
import { send } from '../ws-client.js';
import { getState, setPlayerName } from '../state.js';

// ─── Lobby render ─────────────────────────────────────────────────────────────

export function renderLobby(container: HTMLElement): void {
  container.innerHTML = '';
  container.className = 'lobby-screen';

  const state = getState();
  const room = state.room;

  if (!room) {
    container.appendChild(renderEntryScreen());
  } else if (room.phase === 'lobby') {
    container.appendChild(renderWaitingRoom(room));
  }
}

// ─── Entry screen (create / join) ────────────────────────────────────────────

function renderEntryScreen(): HTMLElement {
  const el = div('entry-screen');

  el.innerHTML = `
    <div class="lobby-logo">
      <h1 class="logo-title">Splendor</h1>
      <p class="logo-sub">A WebSocket Board Game</p>
    </div>
    <div class="lobby-cards">
      <div class="lobby-card" id="create-card">
        <h2>Create Game</h2>
        <label>Your name
          <input id="create-name" type="text" maxlength="20" placeholder="Enter name" autocomplete="off" />
        </label>
        <label>Total players (2–4)
          <select id="total-slots">
            <option value="2">2</option>
            <option value="3" selected>3</option>
            <option value="4">4</option>
          </select>
        </label>
        <div id="ai-slots-config" class="ai-slots-config"></div>
        <button id="create-btn" class="btn btn-primary">Create Room</button>
      </div>
      <div class="lobby-divider"><span>or</span></div>
      <div class="lobby-card" id="join-card">
        <h2>Join Game</h2>
        <label>Your name
          <input id="join-name" type="text" maxlength="20" placeholder="Enter name" autocomplete="off" />
        </label>
        <label>Room code
          <input id="join-code" type="text" maxlength="4" placeholder="XXXX" autocomplete="off"
            style="text-transform:uppercase;letter-spacing:0.2em" />
        </label>
        <button id="join-btn" class="btn btn-secondary">Join Room</button>
        <p id="join-error" class="error-msg" aria-live="polite"></p>
      </div>
    </div>
  `;

  const totalSlotsSelect = el.querySelector<HTMLSelectElement>('#total-slots')!;
  const aiSlotsConfig = el.querySelector<HTMLDivElement>('#ai-slots-config')!;

  function refreshAiConfig(): void {
    const total = parseInt(totalSlotsSelect.value, 10);
    renderAiSlotsConfig(aiSlotsConfig, total);
  }

  totalSlotsSelect.addEventListener('change', refreshAiConfig);
  refreshAiConfig();

  // Pre-fill the join code if the URL has a ?room= param (e.g., someone shared a link)
  const urlCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
  if (urlCode.length === 4) {
    const joinCodeInput = el.querySelector<HTMLInputElement>('#join-code');
    if (joinCodeInput) joinCodeInput.value = urlCode;
  }

  el.querySelector('#create-btn')!.addEventListener('click', () => {
    const name = (el.querySelector<HTMLInputElement>('#create-name')!.value).trim();
    if (!name) return;
    const total = parseInt(totalSlotsSelect.value, 10);
    const aiSlots = collectAiSlots(aiSlotsConfig);
    setPlayerName(name);
    send({ type: 'CREATE_ROOM', playerName: name, totalSlots: total, aiSlots });
  });

  el.querySelector('#join-btn')!.addEventListener('click', () => {
    const name = (el.querySelector<HTMLInputElement>('#join-name')!.value).trim();
    const code = (el.querySelector<HTMLInputElement>('#join-code')!.value).trim().toUpperCase();
    const errEl = el.querySelector<HTMLElement>('#join-error')!;
    if (!name || code.length !== 4) {
      errEl.textContent = 'Enter your name and a 4-character room code.';
      return;
    }
    errEl.textContent = '';
    setPlayerName(name);
    send({ type: 'JOIN_ROOM', roomCode: code, playerName: name });
  });

  return el;
}

const AI_CHARACTERS: Array<{ value: AiDifficulty; label: string }> = [
  { value: 'easy',   label: 'Estaria' },
  { value: 'medium', label: 'Midarvy' },
  { value: 'hard',   label: 'Hadie' },
];

function renderAiSlotsConfig(container: HTMLDivElement, total: number): void {
  // Slots 1…total-1 can optionally be AI (slot 0 is always the host)
  container.innerHTML = '';
  const label = div('ai-slots-label');
  label.textContent = 'Configure player slots:';
  container.appendChild(label);

  for (let i = 1; i < total; i++) {
    const row = div('ai-slot-row');
    row.setAttribute('data-slot', String(i));
    row.innerHTML = `
      <span class="slot-label">Slot ${i + 1}</span>
      <label class="slot-toggle">
        <input type="checkbox" data-ai-slot="${i}" />
        AI player
      </label>
      <select data-ai-diff="${i}" class="diff-select" disabled>
        ${AI_CHARACTERS.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
      </select>
    `;
    const checkbox = row.querySelector<HTMLInputElement>(`[data-ai-slot="${i}"]`)!;
    const select = row.querySelector<HTMLSelectElement>(`[data-ai-diff="${i}"]`)!;
    checkbox.addEventListener('change', () => {
      select.disabled = !checkbox.checked;
      if (checkbox.checked) enforceUniqueAiDifficulty(container, i, select);
      else refreshAiDifficultyOptions(container);
    });
    select.addEventListener('change', () => refreshAiDifficultyOptions(container));
    container.appendChild(row);
  }
}

/** Disable already-chosen difficulties across all active AI selects. */
function refreshAiDifficultyOptions(container: HTMLDivElement): void {
  const activeSelects: Array<HTMLSelectElement> = [];
  const checkboxes = container.querySelectorAll<HTMLInputElement>('[data-ai-slot]');
  for (const cb of checkboxes) {
    if (cb.checked) {
      const idx = cb.getAttribute('data-ai-slot')!;
      const sel = container.querySelector<HTMLSelectElement>(`[data-ai-diff="${idx}"]`)!;
      activeSelects.push(sel);
    }
  }
  const chosenValues = activeSelects.map(s => s.value);
  for (const sel of activeSelects) {
    for (const opt of sel.options) {
      opt.disabled = chosenValues.includes(opt.value) && opt.value !== sel.value;
    }
  }
}

/** After enabling a new AI slot, auto-pick the first unchosen difficulty. */
function enforceUniqueAiDifficulty(container: HTMLDivElement, slotIndex: number, select: HTMLSelectElement): void {
  const checkboxes = container.querySelectorAll<HTMLInputElement>('[data-ai-slot]');
  const usedValues: string[] = [];
  for (const cb of checkboxes) {
    const idx = cb.getAttribute('data-ai-slot')!;
    if (cb.checked && parseInt(idx, 10) !== slotIndex) {
      const s = container.querySelector<HTMLSelectElement>(`[data-ai-diff="${idx}"]`)!;
      usedValues.push(s.value);
    }
  }
  const free = AI_CHARACTERS.find(c => !usedValues.includes(c.value));
  if (free) select.value = free.value;
  refreshAiDifficultyOptions(container);
}

function collectAiSlots(container: HTMLDivElement): Array<{ slotIndex: number; difficulty: AiDifficulty }> {
  const result: Array<{ slotIndex: number; difficulty: AiDifficulty }> = [];
  const checkboxes = container.querySelectorAll<HTMLInputElement>('[data-ai-slot]');
  for (const cb of checkboxes) {
    if (cb.checked) {
      const slotIndex = parseInt(cb.getAttribute('data-ai-slot')!, 10);
      const diff = container.querySelector<HTMLSelectElement>(`[data-ai-diff="${slotIndex}"]`)!.value as AiDifficulty;
      result.push({ slotIndex, difficulty: diff });
    }
  }
  return result;
}

// ─── Waiting room ─────────────────────────────────────────────────────────────

function renderWaitingRoom(room: ReturnType<typeof getState>['room'] & object): HTMLElement {
  const el = div('waiting-room');

  const isHost = getState().myPlayerId === room.hostId;
  const humanSlotsTotal = room.maxPlayers - room.players.filter(p => p.type === 'ai').length;
  const humansFilled = room.players.filter(p => p.type === 'human').length;
  const canStart = humansFilled >= 1; // host is always present; can start with AI filling rest

  el.innerHTML = `
    <h2 class="room-title">Room <span class="room-code">${room.roomCode}</span></h2>
    <p class="room-hint">Share this code with friends to join</p>
    <ul class="player-list">
      ${room.players.map(p => `
        <li class="player-entry ${p.type === 'ai' ? 'ai-entry' : ''}">
          <span class="player-dot"></span>
          <span class="player-name">${escHtml(p.name)}</span>
          ${p.type === 'ai' ? `<span class="ai-badge">${p.aiDifficulty}</span>` : ''}
          ${p.id === room.hostId ? '<span class="host-badge">Host</span>' : ''}
        </li>
      `).join('')}
      ${Array.from({ length: room.maxPlayers - room.players.length }).map(() => `
        <li class="player-entry empty-slot">
          <span class="player-dot empty"></span>
          <span class="player-name muted">Waiting...</span>
        </li>
      `).join('')}
    </ul>
    ${isHost ? `
      <label class="random-start-toggle">
        <input type="checkbox" id="random-start-cb" />
        Random start order
      </label>
      <button id="start-btn" class="btn btn-primary" ${canStart ? '' : 'disabled'}>Start Game</button>
    ` : '<p class="waiting-msg">Waiting for host to start…</p>'}
  `;

  if (isHost) {
    el.querySelector('#start-btn')!.addEventListener('click', () => {
      const randomStart = (el.querySelector<HTMLInputElement>('#random-start-cb')?.checked) ?? false;
      send({ type: 'START_GAME', roomCode: room.roomCode, randomStart });
    });
  }

  return el;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
