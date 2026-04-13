import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ApiKeyService } from '../api-keys/api-key.service';
import { WsReadingEvent, WsAlertEvent } from '@iotproxy/shared';

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: '*' },
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  maxHttpBufferSize: 1e6,
})
export class ReadingsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(ReadingsGateway.name);
  // siteId → Set of socket ids subscribed
  private subscriptions = new Map<string, Set<string>>();
  // Track connection metadata for debugging
  private connectionMetadata = new Map<string, { connectedAt: Date; lastActivity: Date; siteIds: Set<string> }>();
  // Heartbeat interval for connection health monitoring
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
    private apiKeys: ApiKeyService,
  ) {}

  // ── Connection lifecycle ──────────────────────────────────────────────────

  async handleConnection(socket: Socket) {
    try {
      // Check for API key first
      const apiKey = socket.handshake.auth?.apiKey as string
        ?? socket.handshake.headers['x-api-key'] as string;

      if (apiKey) {
        const key = await this.apiKeys.validate(apiKey);
        if (!key) {
          this.logger.warn(`WS rejected invalid API key ${socket.id}`);
          socket.emit('error', { message: 'Invalid API key' });
          socket.disconnect(true);
          return;
        }
        if (!key.websocketEnabled) {
          this.logger.warn(`WS rejected - websocket disabled for API key ${socket.id}`);
          socket.emit('error', { message: 'WebSocket not enabled for this API key' });
          socket.disconnect(true);
          return;
        }
        (socket as any).apiKeyId = key.id;
        (socket as any).organizationId = key.organizationId;
        this.logger.log(`WS connected via API key: ${socket.id}`);
      } else {
        // Fall back to JWT
        const token = socket.handshake.auth?.token as string
          ?? socket.handshake.headers['authorization']?.replace('Bearer ', '');

        if (!token) {
          socket.emit('error', { message: 'No authentication provided' });
          socket.disconnect(true);
          return;
        }

        const payload = this.jwt.verify(token, { secret: this.config.get('jwt.secret') });
        (socket as any).userId = payload.sub;
        (socket as any).organizationId = payload.organizationId;
        this.logger.log(`WS connected via JWT: ${socket.id}`);
      }

      // Track connection metadata
      this.connectionMetadata.set(socket.id, {
        connectedAt: new Date(),
        lastActivity: new Date(),
        siteIds: new Set(),
      });

      // Set up error handling
      socket.on('error', (err) => {
        this.logger.error(`WS error on ${socket.id}: ${err.message}`);
      });

      // Send connection acknowledgment
      socket.emit('connected', { socketId: socket.id });

      // Start heartbeat monitoring if not already running
      if (!this.heartbeatInterval) {
        this.startHeartbeatMonitoring();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(`WS rejected unauthenticated connection ${socket.id}: ${error.message}`);
      socket.emit('error', { message: 'Authentication failed' });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    // Clean up all subscriptions for this socket
    for (const [siteId, sockets] of this.subscriptions.entries()) {
      sockets.delete(socket.id);
      if (sockets.size === 0) this.subscriptions.delete(siteId);
    }

    // Clean up connection metadata
    const metadata = this.connectionMetadata.get(socket.id);
    if (metadata) {
      const duration = Date.now() - metadata.connectedAt.getTime();
      this.logger.log(`WS disconnected: ${socket.id} (duration: ${Math.round(duration / 1000)}s, sites: ${metadata.siteIds.size})`);
      this.connectionMetadata.delete(socket.id);
    } else {
      this.logger.debug(`WS disconnected: ${socket.id}`);
    }

    // Stop heartbeat monitoring if no connections
    if (this.connectionMetadata.size === 0 && this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  // ── Subscribe / unsubscribe ───────────────────────────────────────────────

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() data: { siteId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      if (!data?.siteId) {
        return { error: 'siteId is required' };
      }

      if (!this.subscriptions.has(data.siteId)) {
        this.subscriptions.set(data.siteId, new Set());
      }
      this.subscriptions.get(data.siteId)!.add(socket.id);
      socket.join(`site:${data.siteId}`);

      // Update metadata
      const metadata = this.connectionMetadata.get(socket.id);
      if (metadata) {
        metadata.siteIds.add(data.siteId);
        metadata.lastActivity = new Date();
      }

      this.logger.debug(`WS ${socket.id} subscribed to site ${data.siteId}`);
      return { subscribed: data.siteId };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`WS subscribe error for ${socket.id}: ${error.message}`);
      return { error: 'Subscription failed' };
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() data: { siteId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      if (!data?.siteId) {
        return { error: 'siteId is required' };
      }

      this.subscriptions.get(data.siteId)?.delete(socket.id);
      socket.leave(`site:${data.siteId}`);

      // Update metadata
      const metadata = this.connectionMetadata.get(socket.id);
      if (metadata) {
        metadata.siteIds.delete(data.siteId);
        metadata.lastActivity = new Date();
      }

      this.logger.debug(`WS ${socket.id} unsubscribed from site ${data.siteId}`);
      return { unsubscribed: data.siteId };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`WS unsubscribe error for ${socket.id}: ${error.message}`);
      return { error: 'Unsubscription failed' };
    }
  }

  // ── Emit (called by ReadingsWorker) ──────────────────────────────────────

  emit(siteId: string, event: WsReadingEvent | WsAlertEvent) {
    const subscriberCount = this.subscriptions.get(siteId)?.size ?? 0;
    if (subscriberCount > 0) {
      this.server.to(`site:${siteId}`).emit(event.type, event);
    }
  }

  // ── Heartbeat monitoring ──────────────────────────────────────────────────

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() socket: Socket) {
    const metadata = this.connectionMetadata.get(socket.id);
    if (metadata) {
      metadata.lastActivity = new Date();
    }
    return { pong: Date.now() };
  }

  private startHeartbeatMonitoring() {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      for (const [socketId, metadata] of this.connectionMetadata.entries()) {
        const idleTime = now - metadata.lastActivity.getTime();
        if (idleTime > staleThreshold) {
          this.logger.warn(`Disconnecting stale connection ${socketId} (idle for ${Math.round(idleTime / 1000)}s)`);
          const socket = this.server.sockets.sockets.get(socketId);
          socket?.disconnect(true);
        }
      }

      // Log connection stats every 5 minutes
      if (this.connectionMetadata.size > 0) {
        const totalSites = new Set(
          Array.from(this.connectionMetadata.values()).flatMap(m => Array.from(m.siteIds))
        ).size;
        this.logger.log(`WS Stats: ${this.connectionMetadata.size} connections, ${totalSites} unique sites`);
      }
    }, 60000); // Check every minute
  }
}
