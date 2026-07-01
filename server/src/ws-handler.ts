import type WebSocket from 'ws';
import type http from 'http';
import { randomUUID } from 'crypto';
import type { ClientMessage, ServerMessage } from '@splendor/shared';
import {
  createRoom,
  getRoom,
  joinRoom,
  startGame,
  disconnectPlayer,
  getRoomInfo,
  broadcastToRoom,
  sendToPlayer,
} from './room-manager.js';
import type { Room } from './room-manager.js';
import {
  applyTakeGems,
  applyBuyCard,
  applyReserveCard,
  applyDiscardGems,
} from './game-engine/actions.js';
import { getQualifyingNobles, awardNobleById } from './game-engine/nobles.js';
import { hasTriggeredEndgame, checkAndResolveEndgame } from './game-engine/endgame.js';
import { toClientState } from './game-engine/deck.js';
import type { InternalGameState } from './game-engine/deck.js';
import { executeAiTurn } from './ai/ai-player.js';

// ─── Per-socket state ─────────────────────────────────────────────────────────

interface SocketState {
  playerId: string;
  roomCode?: string;
}

const socketState = new WeakMap<WebSocket, SocketState>();

// ─── Endgame-triggered flag per room (lives outside game state) ───────────────

const endgameFlags = new Map<string, boolean>();

// ─── Entry point ─────────────────────────────────────────────────────────────

export function handleConnection(socket: WebSocket, _req: http.IncomingMessage): void {
  const playerId = randomUUID();
  socketState.set(socket, { playerId });

  send(socket, { type: 'YOUR_ID', playerId });

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMessage;
      handleMessage(socket, msg).catch(err => {
        console.error('ws-handler error:', err);
        send(socket, { type: 'ERROR', code: 'INTERNAL', message: 'Internal server error' });
      });
    } catch {
      send(socket, { type: 'ERROR', code: 'PARSE_ERROR', message: 'Invalid JSON' });
    }
  });

  socket.on('close', () => {
    const state = socketState.get(socket);
    if (state?.roomCode) {
      const room = getRoom(state.roomCode);
      if (room) disconnectPlayer(room, state.playerId);
    }
  });
}

// ─── Message router ──────────────────────────────────────────────────────────

async function handleMessage(socket: WebSocket, msg: ClientMessage): Promise<void> {
  const state = socketState.get(socket)!;

  switch (msg.type) {
    case 'CREATE_ROOM': {
      const room = createRoom(
        state.playerId,
        msg.playerName,
        socket,
        msg.totalSlots,
        msg.aiSlots,
      );
      state.roomCode = room.code;
      room.game && (room.game.roomCode = room.code);
      endgameFlags.set(room.code, false);
      broadcastToRoom(room, { type: 'ROOM_UPDATE', room: getRoomInfo(room) });
      break;
    }

    case 'JOIN_ROOM': {
      const room = getRoom(msg.roomCode.toUpperCase());
      if (!room) {
        send(socket, { type: 'ERROR', code: 'ROOM_NOT_FOUND', message: 'Room not found' });
        return;
      }
      const result = joinRoom(room, state.playerId, msg.playerName, socket);
      if (!result.ok) {
        send(socket, { type: 'ERROR', code: 'JOIN_FAILED', message: result.error });
        return;
      }
      state.roomCode = room.code;
      broadcastToRoom(room, { type: 'ROOM_UPDATE', room: getRoomInfo(room) });
      break;
    }

    case 'START_GAME': {
      const room = getRoom(msg.roomCode);
      if (!room) return;
      if (state.playerId !== room.hostId) {
        send(socket, { type: 'ERROR', code: 'NOT_HOST', message: 'Only the host can start' });
        return;
      }
      const result = startGame(room, msg.randomStart ?? false);
      if (!result.ok) {
        send(socket, { type: 'ERROR', code: 'START_FAILED', message: result.error });
        return;
      }
      room.game!.roomCode = room.code;
      endgameFlags.set(room.code, false);
      broadcastGameState(room);
      // If first player is AI, kick off their turn
      await runAiTurnsIfNeeded(room);
      break;
    }

    case 'TAKE_GEMS':
    case 'BUY_CARD':
    case 'RESERVE_CARD':
    case 'DISCARD_GEMS':
    case 'CHOOSE_NOBLE': {
      const room = state.roomCode ? getRoom(state.roomCode) : undefined;
      if (!room?.game) return;
      if (!isCurrentPlayer(room, state.playerId)) {
        send(socket, { type: 'ERROR', code: 'NOT_YOUR_TURN', message: 'Not your turn' });
        return;
      }

      const game = room.game as InternalGameState;
      const playerIndex = game.currentPlayerIndex;

      if (msg.type === 'CHOOSE_NOBLE') {
        const pendingChoice = game.pendingNobleChoice;
        if (!pendingChoice || pendingChoice.playerId !== state.playerId) {
          send(socket, { type: 'ERROR', code: 'INVALID_ACTION', message: 'No noble choice is pending' });
          return;
        }

        const awarded = awardNobleById(game.players[playerIndex], game.nobles, msg.nobleId);
        if (!awarded) {
          send(socket, { type: 'ERROR', code: 'INVALID_ACTION', message: 'Invalid noble selection' });
          return;
        }

        game.pendingNobleChoice = undefined;
        completeTurn(room, game);

        broadcastGameState(room);
        if (room.phase === 'playing') {
          await runAiTurnsIfNeeded(room);
        }
        return;
      }

      if (game.pendingNobleChoice) {
        send(socket, {
          type: 'ERROR',
          code: 'INVALID_ACTION',
          message: 'Choose a noble before taking another action',
        });
        return;
      }

      const hadPendingDiscard = game.pendingDiscard?.playerId === state.playerId;
      if (game.pendingDiscard && msg.type !== 'DISCARD_GEMS') {
        send(socket, {
          type: 'ERROR',
          code: 'INVALID_ACTION',
          message: 'You must discard gems before taking another action',
        });
        return;
      }
      if (msg.type === 'DISCARD_GEMS' && !hadPendingDiscard) {
        send(socket, {
          type: 'ERROR',
          code: 'INVALID_ACTION',
          message: 'No discard is pending',
        });
        return;
      }

      let result;

      if (msg.type === 'TAKE_GEMS') {
        result = applyTakeGems(game, playerIndex, msg.gems);
      } else if (msg.type === 'BUY_CARD') {
        result = applyBuyCard(game, playerIndex, msg.cardId, msg.fromReserved);
      } else if (msg.type === 'RESERVE_CARD') {
        result = applyReserveCard(game, playerIndex, msg.cardId, msg.tier);
      } else {
        result = applyDiscardGems(game, playerIndex, msg.gems);
      }

      if (!result.ok) {
        send(socket, { type: 'ERROR', code: 'INVALID_ACTION', message: result.error });
        return;
      }

      // If discard is pending, don't advance the turn yet
      if (result.pendingDiscard && result.pendingDiscard > 0) {
        game.pendingDiscard = { playerId: state.playerId, excess: result.pendingDiscard };
        broadcastGameState(room);
        return;
      }

      // Discard completed or not needed
      game.pendingDiscard = undefined;

      // Complete the turn for normal actions and for discard finishing a pending discard.
      if (msg.type !== 'DISCARD_GEMS' || hadPendingDiscard) {
        const qualifyingNobles = getQualifyingNobles(game.players[playerIndex], game.nobles);
        if (qualifyingNobles.length === 1) {
          awardNobleById(game.players[playerIndex], game.nobles, qualifyingNobles[0].id);
          completeTurn(room, game);
        } else if (qualifyingNobles.length > 1) {
          game.pendingNobleChoice = {
            playerId: state.playerId,
            nobles: qualifyingNobles,
          };
          broadcastGameState(room);
          return;
        } else {
          completeTurn(room, game);
        }
      }

      broadcastGameState(room);
      if (room.phase === 'playing') {
        await runAiTurnsIfNeeded(room);
      }
      break;
    }
  }
}

// ─── AI turn loop ──────────────────────────────────────────────────────────────

async function runAiTurnsIfNeeded(room: Room): Promise<void> {
  const game = room.game as InternalGameState | null;
  if (!game || room.phase !== 'playing') return;

  while (true) {
    const currentPlayerId = game.players[game.currentPlayerIndex]?.id;
    const currentSlot = room.slots.find(s => s.playerId === currentPlayerId);
    if (!currentSlot || currentSlot.type !== 'ai') break;

    const endgameTriggered = endgameFlags.get(room.code) ?? false;
    const { endgameTriggeredNow, gameOver } = await executeAiTurn(
      game,
      game.currentPlayerIndex,
      currentSlot.aiDifficulty!,
      endgameTriggered,
    );

    if (endgameTriggeredNow) endgameFlags.set(room.code, true);
    if (gameOver) room.phase = 'finished';

    broadcastGameState(room);

    if (gameOver || room.phase !== 'playing') break;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isCurrentPlayer(room: Room, playerId: string): boolean {
  const game = room.game as InternalGameState | null;
  if (!game) return false;
  const currentPlayer = game.players[game.currentPlayerIndex];
  if (!currentPlayer || currentPlayer.id !== playerId) return false;
  const slot = room.slots.find(s => s.playerId === playerId);
  return slot?.type === 'human';
}

function completeTurn(room: Room, game: InternalGameState): void {
  const triggered = hasTriggeredEndgame(game);
  if (triggered) endgameFlags.set(room.code, true);

  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;

  if (checkAndResolveEndgame(game, endgameFlags.get(room.code) ?? false)) {
    room.phase = 'finished';
  }
}

function broadcastGameState(room: Room): void {
  if (!room.game) return;
  broadcastToRoom(room, {
    type: 'GAME_STATE',
    state: toClientState(room.game as InternalGameState),
  });
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === 1 /* OPEN */) {
    socket.send(JSON.stringify(msg));
  }
}
