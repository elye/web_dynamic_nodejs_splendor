# Splendor — WebSocket Board Game

A faithful, multiplayer implementation of the Splendor board game played in the browser over WebSockets. Supports 2–4 players with optional AI opponents at three difficulty levels.

## Features

- **Full Splendor rules** — all turn actions (take gems, buy card, reserve card), gold joker, nobles auto-awarded, 15 VP trigger with full-round completion, tiebreak by fewest cards
- **Real-time multiplayer** — up to 4 players in a room via WebSocket; full game state broadcast after every action
- **AI opponents** — Easy (random), Medium (greedy), Hard (heuristic) — run server-side, configurable per slot in the lobby
- **Room system** — host creates a room with a 4-character code; guests join by code; host configures AI slots before starting
- **Polished UI** — board-game aesthetic with felt-green table, tiered card styles, gem token circles, noble tiles, opponent strips, and action modals

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js · TypeScript · [`ws`](https://github.com/websockets/ws) |
| Client | Vanilla TypeScript · [Vite](https://vitejs.dev) · hand-written CSS |
| Shared types | `@splendor/shared` workspace package |
| Dev runner | [`tsx`](https://github.com/privatenumber/tsx) (no compile step in dev) |
| Monorepo | npm workspaces |

## Project Structure

```
web-socket-splendor/
├── shared/                   # Shared types & constants (imported by both sides)
│   └── src/
│       ├── types.ts          # Domain types, wire message discriminated unions
│       └── constants.ts      # Full 90-card deck, 10 nobles, bank rules
│
├── server/
│   └── src/
│       ├── index.ts          # HTTP static server + WebSocket server
│       ├── ws-handler.ts     # Message routing, AI turn loop, endgame tracking
│       ├── room-manager.ts   # Room lifecycle (create/join/leave/destroy)
│       ├── game-engine/
│       │   ├── deck.ts       # Shuffle, deal, refill slots, broadcast sanitisation
│       │   ├── actions.ts    # Validate & apply all turn actions
│       │   ├── nobles.ts     # Auto-award noble tiles
│       │   └── endgame.ts    # 15VP trigger, winner resolution, tiebreak
│       └── ai/
│           ├── easy.ts       # Random valid move
│           ├── medium.ts     # Greedy (highest VP affordable first)
│           ├── hard.ts       # Heuristic (noble proximity, tier-3 reserving)
│           └── ai-player.ts  # Dispatcher with 1.2 s artificial delay
│
└── client/
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── main.ts           # App bootstrap, screen routing
        ├── ws-client.ts      # WebSocket wrapper with auto-reconnect
        ├── state.ts          # Reactive client state store
        ├── ui/
        │   ├── lobby.ts      # Create/join room screens, AI slot config
        │   ├── board.ts      # Game board (nobles, tier rows, gem bank)
        │   ├── card.ts       # Card, deck placeholder, noble tile, gem token elements
        │   ├── player-panel.ts  # Opponent strips + own full panel
        │   └── action-modal.ts  # Gem picker, card buy/reserve, discard modals
        └── styles/
            ├── base.css      # Reset, layout, lobby, buttons, toasts
            ├── cards.css     # Card tier styles, noble tiles, deck placeholders
            ├── tokens.css    # Gem token circles and pip styles
            ├── board.css     # Game layout grid, board area, bank panel
            └── panels.css    # Opponent strips and own player panel
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Development

Starts the server (port 3000) and Vite dev server (port 5173) concurrently with hot reload:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in two or more browser tabs to play.

> The Vite dev server proxies `/ws` to the Node server, so WebSocket connections work without CORS configuration.

### Production Build

```bash
npm run build
```

This compiles the shared package, then the client (output to `client/dist/`). The Node server serves the client files statically — run with:

```bash
node --import tsx/esm server/src/index.ts
```

Or compile the server first and run the output directly:

```bash
cd server && npx tsc && node dist/index.js
```

Both are served from **http://localhost:3000**.

## How to Play

1. **Host** opens the app, enters a name, chooses total players (2–4), optionally marks slots as AI and picks difficulty, then clicks **Create Room**.
2. **Guests** enter a name and the 4-character room code, then click **Join Room**.
3. Once all human slots are filled, the host clicks **Start Game**.
4. On your turn, click a gem token to open the gem picker, or click a card to buy or reserve it. Confirm your move in the modal.
5. First player to reach 15 prestige points triggers the final round. Highest score after the round ends wins (tiebreak: fewest development cards).

## Architecture Notes

- **Server is the single source of truth.** All game logic and validation lives on the server. Clients hold a read-only snapshot.
- **Full state broadcast.** After every action the entire `GameState` is sent to all players. At ≤4 players and ~100 cards, payloads are tiny (<5 KB).
- **AI is server-side.** After each human turn the server checks if the next player is an AI, runs their decision, and broadcasts the result with a 1.2 s delay for readability.
- **No persistence.** Rooms are in-memory. If the server restarts, all games are lost. Rooms auto-destroy 60 seconds after all humans disconnect.
- **No authentication.** Players enter a display name only. Room codes are 4-character alphanumeric strings.

## Game Rules Summary

| Action | Rule |
|---|---|
| Take 3 gems | Take 1 each of 3 different colours (can take fewer) |
| Take 2 gems | Take 2 of the same colour — pile must have ≥ 4 |
| Reserve card | Take a face-up card or face-down from deck top; receive 1 gold if available; max 3 reserved |
| Buy card | Pay cost (card bonuses reduce cost; gold is a joker); from board or reserved hand |
| Gem hand limit | Max 10 gems; must discard excess before turn ends |
| Nobles | Auto-awarded at end of turn when card bonus requirements are met (not a player action) |
| End game | Triggered when a player reaches 15 VP; full round completes; highest score wins |
| Tiebreak | Most VP wins; if tied, fewest owned development cards wins |
