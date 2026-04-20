import { io, Socket } from 'socket.io-client';
import { WsReadingEvent, WsAlertEvent } from '@iotproxy/shared';

// ── Singleton socket ──────────────────────────────────────────────────────────

let socket: Socket | null = null;
let pingInterval: NodeJS.Timeout | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true while the socket is connecting OR already connected.
 * socket.active = true means socket.io is managing the connection lifecycle
 * (i.e. it is either connected, or in the middle of a reconnect back-off).
 * We must NOT destroy it in this state — that is the root cause of the
 * "connect → disconnect → connect" loop seen in strict-mode or fast navigation.
 */
function isAlive(s: Socket): boolean {
  return s.active;   // socket.io v4: true while connected or reconnecting
}

function startPingInterval() {
  stopPingInterval();
  pingInterval = setInterval(() => {
    if (socket?.connected) {
      const sent = Date.now();
      socket.emit('ping', {}, (response: any) => {
        if (response?.pong) {
          console.debug('[WS] Ping ok, latency:', Date.now() - sent, 'ms');
        }
      });
    }
  }, 30_000);
}

function stopPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// ── Public: getSocket ─────────────────────────────────────────────────────────

export function getSocket(): Socket | null {
  if (!localStorage.getItem('accessToken')) {
    console.warn('[WS] No access token, skipping connection');
    return null;
  }

  // If a socket already exists and is alive (connected OR mid-reconnect), reuse it.
  // Do NOT tear it down just because it isn't connected yet — that creates the loop.
  if (socket && isAlive(socket)) {
    return socket;
  }

  // Clean up a truly dead socket (disconnected and no longer retrying)
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  console.log('[WS] Creating socket');
  socket = io('/ws', {
    // Callback form: token fetched fresh on every (re)connect handshake
    auth: (cb) => cb({ token: localStorage.getItem('accessToken') }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,   // let socket.io decide; we gate via reconnect_failed
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.4,         // jitter prevents thundering-herd on server restart
    timeout: 20_000,
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected');
    startPingInterval();
    notifyConnectionListeners(true);
  });

  socket.on('connected', (data) => {
    console.log('[WS] Server ack:', data.socketId);
  });

  // connect_error fires on each failed attempt.
  // We intentionally do NOT count attempts here — socket.io manages that internally.
  // Calling disconnectSocket() inside connect_error used to kill the retry loop early.
  socket.on('connect_error', (err) => {
    console.warn('[WS] Connect error:', err.message);
  });

  socket.on('reconnect_attempt', (n) => {
    console.log(`[WS] Reconnect attempt #${n}`);
  });

  socket.on('reconnect', () => {
    console.log('[WS] Reconnected');
  });

  // Only fires when reconnectionAttempts is a finite number and is exhausted.
  // With Infinity above this won't fire unless we explicitly set a finite limit elsewhere.
  socket.on('reconnect_failed', () => {
    console.error('[WS] All reconnect attempts exhausted');
    disconnectSocket();
    notifyConnectionListeners(false);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[WS] Disconnected:', reason);
    stopPingInterval();
    notifyConnectionListeners(false);

    // 'io server disconnect' = server explicitly closed the socket (e.g. bad token).
    // socket.io will NOT auto-reconnect in this case; we must call connect() ourselves
    // — but only after we have a fresh token (the auth callback handles that).
    if (reason === 'io server disconnect') {
      console.warn('[WS] Server-initiated disconnect, scheduling reconnect');
      setTimeout(() => socket?.connect(), 2_000);
    }
  });

  socket.on('error', (err) => {
    console.error('[WS] Socket error:', err);
  });

  return socket;
}

// ── Public: disconnect ────────────────────────────────────────────────────────

export function disconnectSocket() {
  console.log('[WS] Disconnecting');
  stopPingInterval();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  connectionListeners.clear();
}

// ── Public: manual reconnect ──────────────────────────────────────────────────

export function reconnect() {
  console.log('[WS] Manual reconnect');
  if (socket && !socket.connected) {
    socket.connect();
  } else if (!socket) {
    getSocket();
  }
}

// ── Connection-state broadcast ────────────────────────────────────────────────
// Allows components to react to global socket connect/disconnect without
// subscribing to a specific site.

type ConnectionListener = (connected: boolean) => void;
const connectionListeners = new Set<ConnectionListener>();

export function onConnectionChange(fn: ConnectionListener): () => void {
  connectionListeners.add(fn);
  // Deliver current state immediately
  fn(socket?.connected ?? false);
  return () => connectionListeners.delete(fn);
}

function notifyConnectionListeners(connected: boolean) {
  connectionListeners.forEach((fn) => fn(connected));
}

// ── Reconnect on visibility change ────────────────────────────────────────────
// If the tab goes to background and the connection dies, reconnect when the
// user comes back. This is a very common source of "stale" connections.

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (socket && !socket.connected && !socket.active) {
        console.log('[WS] Tab re-focused, reconnecting');
        reconnect();
      } else if (!socket && localStorage.getItem('accessToken')) {
        getSocket();
      }
    }
  });
}

// ── Public: isConnected ───────────────────────────────────────────────────────

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// ── Public: subscribeToSite ───────────────────────────────────────────────────

export function subscribeToSite(
  siteId: string,
  onReading: (e: WsReadingEvent) => void,
  onAlert: (e: WsAlertEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const s = getSocket();
  if (!s) {
    console.warn('[WS] No socket, cannot subscribe to site', siteId);
    onConnectionChange?.(false);
    return () => {};
  }

  // ── Filtered wrappers ─────────────────────────────────────────────────────
  // The socket is a singleton shared across all subscriptions.
  // Filter by siteId so readings from a previously-subscribed site don't
  // leak into a component that subscribed to a different site.
  const handleReading = (e: WsReadingEvent) => {
    if (e.siteId === siteId) onReading(e);
  };
  const handleAlert = (e: WsAlertEvent) => {
    if (e.siteId === siteId) onAlert(e);
  };

  // ── Re-subscribe after reconnect ──────────────────────────────────────────
  const handleConnect = () => {
    console.log(`[WS] (Re)connected, subscribing to site ${siteId}`);
    s.emit('subscribe', { siteId }, (res: any) => {
      if (res?.error) console.error('[WS] Subscribe error:', res.error);
    });
    onConnectionChange?.(true);
  };

  const handleDisconnect = () => {
    onConnectionChange?.(false);
  };

  s.on('connect', handleConnect);
  s.on('disconnect', handleDisconnect);
  s.on('reading', handleReading);
  s.on('alert', handleAlert);

  // Deliver initial state and subscribe right away if already connected
  if (s.connected) {
    onConnectionChange?.(true);
    s.emit('subscribe', { siteId }, (res: any) => {
      if (res?.error) console.error('[WS] Subscribe error:', res.error);
      else console.log(`[WS] Subscribed to site ${siteId}`);
    });
  } else {
    onConnectionChange?.(false);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  return () => {
    s.off('connect', handleConnect);
    s.off('disconnect', handleDisconnect);
    s.off('reading', handleReading);
    s.off('alert', handleAlert);

    if (s.connected) {
      s.emit('unsubscribe', { siteId });
    }
  };
}
