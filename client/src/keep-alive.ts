/**
 * keep-alive.ts
 *
 * On Render's free tier the server spins down after inactivity.
 * While a game is in progress we ping /ping every 5 minutes via HTTP
 * so the dyno stays warm.
 */

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let pingTimer: ReturnType<typeof setInterval> | null = null;

async function ping(): Promise<void> {
  try {
    await fetch('/ping');
  } catch {
    // Silently ignore — the WebSocket reconnect logic handles real outages.
  }
}

export function startKeepAlive(): void {
  if (pingTimer !== null) return; // already running
  ping(); // immediate first ping
  pingTimer = setInterval(ping, PING_INTERVAL_MS);
}

export function stopKeepAlive(): void {
  if (pingTimer === null) return;
  clearInterval(pingTimer);
  pingTimer = null;
}
