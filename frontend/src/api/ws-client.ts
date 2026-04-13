import { io, Socket } from 'socket.io-client';
import { WsReadingEvent, WsAlertEvent } from '@iotproxy/shared';

let socket: Socket | null = null;
let pingInterval: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 15;

export function getSocket(): Socket | null {
  // Don't attempt to connect without a token — server will reject and retry forever
  if (!localStorage.getItem('accessToken')) {
    console.warn('[WS] No access token, skipping connection');
    return null;
  }

  if (!socket || !socket.connected) {
    if (socket) {
      // Clean up existing disconnected socket
      socket.removeAllListeners();
      socket.disconnect();
    }

    console.log('[WS] Creating new socket connection');
    socket = io('/ws', {
      // Callback form: called on every (re)connect so a refreshed token is always sent
      auth: (cb) => cb({ token: localStorage.getItem('accessToken') }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      timeout: 20000,
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('[WS] Connected successfully');
      reconnectAttempts = 0;
      startPingInterval();
    });

    socket.on('connected', (data) => {
      console.log('[WS] Server acknowledged connection:', data.socketId);
    });

    socket.on('connect_error', (err) => {
      reconnectAttempts++;
      console.warn(`[WS] Connect error (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}):`, err.message);
      
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[WS] Max reconnection attempts reached, giving up');
        disconnectSocket();
      }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[WS] Reconnection attempt ${attemptNumber}`);
    });

    socket.on('reconnect_failed', () => {
      console.error('[WS] Reconnection failed after all attempts');
      disconnectSocket();
    });

    socket.on('disconnect', (reason) => {
      console.warn('[WS] Disconnected:', reason);
      stopPingInterval();
      
      if (reason === 'io server disconnect') {
        // Server actively rejected us (auth failure) — don't auto-reconnect with same token
        console.error('[WS] Server disconnected us, likely auth failure');
        disconnectSocket();
      } else if (reason === 'transport close' || reason === 'transport error') {
        // Network issues, let socket.io handle reconnection
        console.log('[WS] Network issue, will attempt reconnection');
      }
    });

    socket.on('error', (err) => {
      console.error('[WS] Socket error:', err);
    });
  }

  return socket;
}

export function disconnectSocket() {
  console.log('[WS] Disconnecting socket');
  stopPingInterval();
  
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  
  reconnectAttempts = 0;
}

function startPingInterval() {
  stopPingInterval();
  
  pingInterval = setInterval(() => {
    if (socket?.connected) {
      socket.emit('ping', {}, (response: any) => {
        if (response?.pong) {
          console.debug('[WS] Ping successful, latency:', Date.now() - response.pong, 'ms');
        }
      });
    }
  }, 30000); // Ping every 30 seconds
}

function stopPingInterval() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

export function subscribeToSite(
  siteId: string,
  onReading: (e: WsReadingEvent) => void,
  onAlert: (e: WsAlertEvent) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  const s = getSocket();
  if (!s) {
    console.warn('[WS] Cannot subscribe to site, no socket available');
    onConnectionChange?.(false);
    return () => {};
  }

  const onConnect = () => {
    console.log(`[WS] Reconnected, re-subscribing to site ${siteId}`);
    s.emit('subscribe', { siteId }, (response: any) => {
      if (response?.error) {
        console.error('[WS] Subscribe error:', response.error);
      } else {
        console.log('[WS] Subscribed to site:', response?.subscribed);
      }
    });
    onConnectionChange?.(true);
  };
  
  const onDisconnect = () => {
    console.log('[WS] Disconnected from site subscription');
    onConnectionChange?.(false);
  };

  // Set initial connection state
  onConnectionChange?.(s.connected);
  
  // Listen for connection state changes
  s.on('connect', onConnect);
  s.on('disconnect', onDisconnect);

  // Subscribe to site
  if (s.connected) {
    s.emit('subscribe', { siteId }, (response: any) => {
      if (response?.error) {
        console.error('[WS] Subscribe error:', response.error);
      } else {
        console.log('[WS] Subscribed to site:', response?.subscribed);
      }
    });
  } else {
    console.log('[WS] Not connected yet, will subscribe on connect');
  }
  
  // Listen for events
  s.on('reading', onReading);
  s.on('alert', onAlert);

  // Return cleanup function
  return () => {
    console.log(`[WS] Unsubscribing from site ${siteId}`);
    s.off('connect', onConnect);
    s.off('disconnect', onDisconnect);
    
    if (s.connected) {
      s.emit('unsubscribe', { siteId }, (response: any) => {
        if (response?.error) {
          console.error('[WS] Unsubscribe error:', response.error);
        } else {
          console.log('[WS] Unsubscribed from site:', response?.unsubscribed);
        }
      });
    }
    
    s.off('reading', onReading);
    s.off('alert', onAlert);
  };
}

// Export connection status checker
export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// Export manual reconnection trigger
export function reconnect() {
  console.log('[WS] Manual reconnection triggered');
  if (socket) {
    socket.connect();
  } else {
    getSocket();
  }
}
