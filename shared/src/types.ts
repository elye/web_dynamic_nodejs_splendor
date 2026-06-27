// ─── Gem colours ─────────────────────────────────────────────────────────────

export type GemColor = 'white' | 'blue' | 'green' | 'red' | 'black';
export type GemColorOrGold = GemColor | 'gold';

export type GemCost = Record<GemColor, number>;
export type GemPool = Partial<Record<GemColorOrGold, number>>;

// ─── Cards ───────────────────────────────────────────────────────────────────

export type CardTier = 1 | 2 | 3;

export interface Card {
  id: string;
  tier: CardTier;
  bonus: GemColor;       // gem discount this card provides
  points: number;        // prestige points (0 for most tier-1 cards)
  cost: GemCost;
}

// ─── Nobles ──────────────────────────────────────────────────────────────────

export interface Noble {
  id: string;
  points: number;        // always 3
  requirement: GemCost;  // required card bonuses (not gems)
}

// ─── Players ─────────────────────────────────────────────────────────────────

export type PlayerType = 'human' | 'ai';
export type AiDifficulty = 'easy' | 'medium' | 'hard';

export interface PlayerState {
  id: string;
  name: string;
  type: PlayerType;
  aiDifficulty?: AiDifficulty;
  gems: GemPool;
  bonuses: Record<GemColor, number>;  // sum of owned card bonuses per colour
  reservedCards: Card[];
  ownedCards: Card[];
  nobles: Noble[];
  points: number;
}

// ─── Game phase ───────────────────────────────────────────────────────────────

export type GamePhase = 'waiting' | 'playing' | 'finished';

// ─── Board state ─────────────────────────────────────────────────────────────

export interface TierState {
  tier: CardTier;
  faceUp: (Card | null)[];  // exactly 4 slots; null = deck ran out
  deckCount: number;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: PlayerState[];
  currentPlayerIndex: number;
  tiers: [TierState, TierState, TierState];  // index 0 = tier 1, 1 = tier 2, 2 = tier 3
  bank: GemPool;
  nobles: Noble[];
  // Set once game ends
  winnerIds?: string[];
  // Pending discard: player must discard down to 10 gems before turn ends
  pendingDiscard?: { playerId: string; excess: number };
}

// ─── Room ────────────────────────────────────────────────────────────────────

export interface RoomSlot {
  type: PlayerType;
  aiDifficulty?: AiDifficulty;
  playerId?: string;  // set once a human connects to this slot
}

export interface RoomConfig {
  slots: RoomSlot[];  // length 2–4
}

export type RoomPhase = 'lobby' | 'playing' | 'finished';

export interface RoomInfo {
  roomCode: string;
  hostId: string;
  phase: RoomPhase;
  players: Array<{ id: string; name: string; type: PlayerType; aiDifficulty?: AiDifficulty }>;
  maxPlayers: number;
}

// ─── Client → Server messages ─────────────────────────────────────────────────

export interface MsgJoinRoom {
  type: 'JOIN_ROOM';
  roomCode: string;
  playerName: string;
}

export interface MsgCreateRoom {
  type: 'CREATE_ROOM';
  playerName: string;
  totalSlots: number;  // 2–4
  aiSlots: Array<{ slotIndex: number; difficulty: AiDifficulty }>;
}

export interface MsgStartGame {
  type: 'START_GAME';
  roomCode: string;
}

export interface MsgTakeGems {
  type: 'TAKE_GEMS';
  gems: GemPool;  // keys are colours, values are counts (1 or 2 for double-take)
}

export interface MsgBuyCard {
  type: 'BUY_CARD';
  cardId: string;
  fromReserved: boolean;
}

export interface MsgReserveCard {
  type: 'RESERVE_CARD';
  cardId: string | null;  // null = reserve face-down from deck
  tier?: CardTier;        // required when cardId is null
}

export interface MsgDiscardGems {
  type: 'DISCARD_GEMS';
  gems: GemPool;  // gems to return to bank
}

export type ClientMessage =
  | MsgJoinRoom
  | MsgCreateRoom
  | MsgStartGame
  | MsgTakeGems
  | MsgBuyCard
  | MsgReserveCard
  | MsgDiscardGems;

// ─── Server → Client messages ─────────────────────────────────────────────────

export interface MsgRoomUpdate {
  type: 'ROOM_UPDATE';
  room: RoomInfo;
}

export interface MsgGameState {
  type: 'GAME_STATE';
  state: GameState;
}

export interface MsgError {
  type: 'ERROR';
  code: string;
  message: string;
}

export interface MsgYourId {
  type: 'YOUR_ID';
  playerId: string;
}

export type ServerMessage =
  | MsgRoomUpdate
  | MsgGameState
  | MsgError
  | MsgYourId;

