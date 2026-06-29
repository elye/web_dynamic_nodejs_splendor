import type { RoomInfo, PlayerType, AiDifficulty } from '@splendor/shared';
import type WebSocket from 'ws';
import { createGame } from './game-engine/deck.js';
import type { GameState } from '@splendor/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerSlot {
  type: PlayerType;
  aiDifficulty?: AiDifficulty;
  playerId?: string;
  playerName?: string;
  socket?: WebSocket;
}

export interface Room {
  code: string;
  hostId: string;
  slots: PlayerSlot[];
  phase: 'lobby' | 'playing' | 'finished';
  game: GameState | null;
  destroyTimer?: ReturnType<typeof setTimeout>;
}

// ─── State ────────────────────────────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ─── Room code generation ─────────────────────────────────────────────────────

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function createRoom(
  hostId: string,
  hostName: string,
  hostSocket: WebSocket,
  totalSlots: number,
  aiSlots: Array<{ slotIndex: number; difficulty: AiDifficulty }>,
): Room {
  const code = generateRoomCode();

  const slots: PlayerSlot[] = Array.from({ length: totalSlots }, (_, i) => {
    const aiSlot = aiSlots.find(a => a.slotIndex === i);
    if (aiSlot) {
      return {
        type: 'ai' as PlayerType,
        aiDifficulty: aiSlot.difficulty,
        playerId: `ai-${code}-${i}`,
        playerName: `AI (${aiSlot.difficulty.charAt(0).toUpperCase() + aiSlot.difficulty.slice(1)})`,
      };
    }
    return { type: 'human' as PlayerType };
  });

  // Host always fills the first human slot
  const firstHumanSlot = slots.find(s => s.type === 'human');
  if (firstHumanSlot) {
    firstHumanSlot.playerId = hostId;
    firstHumanSlot.playerName = hostName;
    firstHumanSlot.socket = hostSocket;
  }

  const room: Room = { code, hostId, slots, phase: 'lobby', game: null };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function joinRoom(
  room: Room,
  playerId: string,
  playerName: string,
  socket: WebSocket,
): { ok: true } | { ok: false; error: string } {
  if (room.phase !== 'lobby') {
    return { ok: false, error: 'Game already started' };
  }

  const emptyHumanSlot = room.slots.find(s => s.type === 'human' && !s.playerId);
  if (!emptyHumanSlot) {
    return { ok: false, error: 'Room is full' };
  }

  emptyHumanSlot.playerId = playerId;
  emptyHumanSlot.playerName = playerName;
  emptyHumanSlot.socket = socket;

  // Cancel pending destroy timer if someone rejoins
  if (room.destroyTimer) {
    clearTimeout(room.destroyTimer);
    room.destroyTimer = undefined;
  }

  return { ok: true };
}

export function startGame(room: Room, randomStart = false): { ok: true } | { ok: false; error: string } {
  if (room.phase !== 'lobby') {
    return { ok: false, error: 'Game already started' };
  }

  const humanSlotsFilled = room.slots.every(s => s.type !== 'human' || s.playerId);
  const playerCount = room.slots.length;

  if (!humanSlotsFilled) {
    return { ok: false, error: 'Not all player slots are filled' };
  }

  if (playerCount < 2 || playerCount > 4) {
    return { ok: false, error: 'Requires 2–4 players' };
  }

  room.game = createGame(
    room.slots.map(s => ({
      id: s.playerId!,
      name: s.playerName!,
      type: s.type,
      aiDifficulty: s.aiDifficulty,
    })),
    randomStart,
  );
  room.phase = 'playing';
  return { ok: true };
}

export function disconnectPlayer(room: Room, playerId: string): void {
  const slot = room.slots.find(s => s.playerId === playerId);
  if (slot) {
    slot.socket = undefined;
  }

  const anyHumanConnected = room.slots.some(s => s.type === 'human' && s.socket);
  if (!anyHumanConnected) {
    // Schedule destruction after 60 s if nobody reconnects
    room.destroyTimer = setTimeout(() => {
      rooms.delete(room.code);
    }, 60_000);
  }
}

export function reconnectPlayer(room: Room, playerId: string, socket: WebSocket): boolean {
  const slot = room.slots.find(s => s.playerId === playerId);
  if (!slot) return false;
  slot.socket = socket;

  if (room.destroyTimer) {
    clearTimeout(room.destroyTimer);
    room.destroyTimer = undefined;
  }
  return true;
}

export function getRoomInfo(room: Room): RoomInfo {
  return {
    roomCode: room.code,
    hostId: room.hostId,
    phase: room.phase,
    maxPlayers: room.slots.length,
    players: room.slots
      .filter(s => s.playerId != null)
      .map(s => ({
        id: s.playerId!,
        name: s.playerName!,
        type: s.type,
        aiDifficulty: s.aiDifficulty,
      })),
  };
}

export function broadcastToRoom(room: Room, message: object): void {
  const data = JSON.stringify(message);
  for (const slot of room.slots) {
    if (slot.socket?.readyState === 1 /* OPEN */) {
      slot.socket.send(data);
    }
  }
}

export function sendToPlayer(room: Room, playerId: string, message: object): void {
  const slot = room.slots.find(s => s.playerId === playerId);
  if (slot?.socket?.readyState === 1) {
    slot.socket.send(JSON.stringify(message));
  }
}
