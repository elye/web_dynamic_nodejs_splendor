import type { ClientMessage, ServerMessage } from '@splendor/shared';

type MessageHandler = (msg: ServerMessage) => void;

const WS_PATH = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

let socket: WebSocket | null = null;
const handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connect(): void {
  if (socket) return;
  _connect();
}

function _connect(): void {
  socket = new WebSocket(WS_PATH);

  socket.addEventListener('open', () => {
    console.log('[ws] connected');
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      for (const h of handlers) h(msg);
    } catch (err) {
      console.error('[ws] parse error', err);
    }
  });

  socket.addEventListener('close', () => {
    console.warn('[ws] disconnected — reconnecting in 2 s');
    socket = null;
    reconnectTimer = setTimeout(_connect, 2000);
  });

  socket.addEventListener('error', () => {
    socket?.close();
  });
}

export function send(msg: ClientMessage): void {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  } else {
    console.warn('[ws] not connected, dropping message', msg.type);
  }
}

export function onMessage(handler: MessageHandler): () => void {
  handlers.push(handler);
  return () => {
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  };
}
