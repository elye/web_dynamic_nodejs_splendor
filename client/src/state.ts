import type { GameState, RoomInfo } from '@splendor/shared';

// ─── App state ────────────────────────────────────────────────────────────────

export interface AppState {
  myPlayerId: string | null;
  room: RoomInfo | null;
  game: GameState | null;
  screen: 'lobby' | 'game';
}

const state: AppState = {
  myPlayerId: null,
  room: null,
  game: null,
  screen: 'lobby',
};

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
