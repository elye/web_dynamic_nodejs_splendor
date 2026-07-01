import type { GameState, RoomInfo } from '@splendor/shared';

// ─── App state ────────────────────────────────────────────────────────────────

export interface AppState {
  myPlayerId: string | null;
  myPlayerName: string | null;
  room: RoomInfo | null;
  game: GameState | null;
  screen: 'lobby' | 'game';
}

const state: AppState = {
  myPlayerId: null,
  myPlayerName: null,
  room: null,
  game: null,
  screen: 'lobby',
};

// ─── Session persistence ──────────────────────────────────────────────────────

const SESSION_KEY = 'splendor_session';

interface PersistedSession {
  playerId: string;
  playerName: string;
  roomCode: string;
}

export function saveSession(playerId: string, playerName: string, roomCode: string): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ playerId, playerName, roomCode }));
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

// ─── Subscribers ──────────────────────────────────────────────────────────────

type Listener = (state: AppState) => void;
const listeners: Listener[] = [];

function notify(): void {
  for (const l of listeners) l(state);
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function getState(): Readonly<AppState> {
  return state;
}

// ─── Mutators ─────────────────────────────────────────────────────────────────

export function setPlayerId(id: string): void {
  state.myPlayerId = id;
  notify();
}

export function setPlayerName(name: string): void {
  state.myPlayerName = name;
  notify();
}

export function setRoom(room: RoomInfo): void {
  state.room = room;
  if (room.phase === 'playing' || room.phase === 'finished') {
    state.screen = 'game';
  }
  notify();
}

export function setGame(game: GameState): void {
  state.game = game;
  state.screen = 'game';
  notify();
}

export function setScreen(screen: AppState['screen']): void {
  state.screen = screen;
  notify();
}

export function resetToLobby(): void {
  state.room = null;
  state.game = null;
  state.screen = 'lobby';
  notify();
}
