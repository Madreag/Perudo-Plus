// ============================================
// Perudo+ Session Manager
// Handles multiple game sessions (server browser)
// ============================================

import WebSocket, { WebSocketServer } from 'ws';
import http from 'http';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  GameSettings,
  ClientMessage,
  ServerMessage,
  SessionInfo,
  CreateSessionPayload,
  JoinSessionPayload
} from '../shared/types';
import { GameSession } from './GameSession';

interface ConnectedClient {
  ws: WebSocket;
  identityId: string;      // Persistent identity across reconnects
  playerName: string | null;
  ip: string;
  currentSessionId: string | null;
  previousSessionId: string | null;  // For reconnection tracking
}

const DEFAULT_SETTINGS: GameSettings = {
  mode: 'tactical',
  maxPlayers: 6,
  enableCalza: false,
  enableLastStand: false
};

export class SessionManager {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private sessions: Map<string, GameSession> = new Map();
  private clients: Map<string, ConnectedClient> = new Map(); // clientId -> ConnectedClient
  private identityToSession: Map<string, string> = new Map(); // identityId -> sessionId (for reconnection)
  private port: number;
  private publicIp: string = '';
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(port: number) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    
    this.setupExpress();
    this.setupWebSocket();
    this.startCleanupTask();
  }

  private setupExpress(): void {
    this.app.use(express.static('dist/client-bundle'));
    
    // API endpoint for server info
    this.app.get('/api/info', (req, res) => {
      res.json({
        publicIp: this.publicIp,
        port: this.port,
        sessionCount: this.sessions.size,
        totalPlayers: this.getTotalPlayerCount()
      });
    });

    // API endpoint for session list
    this.app.get('/api/sessions', (req, res) => {
      res.json({
        sessions: this.getSessionList()
      });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      const clientId = uuidv4();
      let clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() 
        || req.socket.remoteAddress 
        || 'unknown';
      
      // Convert IPv6 mapped IPv4 addresses
      if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.substring(7);
      }
      if (clientIp === '::1' || clientIp === '127.0.0.1') {
        clientIp = 'localhost';
      }
      
      console.log(`Client connected: ${clientId} from ${clientIp}`);

      // Create client entry (identity will be assigned on register)
      this.clients.set(clientId, {
        ws,
        identityId: '',
        playerName: null,
        ip: clientIp,
        currentSessionId: null,
        previousSessionId: null
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: ClientMessage = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          console.error('Error parsing message:', error);
          this.sendError(ws, 'Invalid message format', 'PARSE_ERROR');
        }
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
      });
    });
  }

  private handleMessage(clientId: string, message: ClientMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    console.log(`Received message from ${clientId}:`, message.type);

    // Session management messages
    switch (message.type) {
      case 'register':
        this.handleRegister(clientId, message.payload);
        return;
      case 'list_sessions':
        this.handleListSessions(clientId);
        return;
      case 'create_session':
        this.handleCreateSession(clientId, message.payload as CreateSessionPayload);
        return;
      case 'join_session':
        this.handleJoinSession(clientId, message.payload as JoinSessionPayload);
        return;
      case 'leave_session':
        this.handleLeaveSession(clientId);
        return;
      case 'update_session_settings':
        this.handleUpdateSessionSettings(clientId, message.payload);
        return;
      case 'delete_session':
        this.handleDeleteSession(clientId);
        return;
    }

    // Forward game messages to the appropriate session
    if (client.currentSessionId) {
      const session = this.sessions.get(client.currentSessionId);
      if (session) {
        session.handleMessage(clientId, client.ws, client.ip, client.identityId, message);
      } else {
        this.sendError(client.ws, 'Session not found', 'SESSION_NOT_FOUND');
      }
    } else {
      this.sendError(client.ws, 'Not in a session', 'NOT_IN_SESSION');
    }
  }

  private handleRegister(clientId: string, payload: { identityId?: string; playerName: string }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Use provided identity or generate new one
    const identityId = payload.identityId || uuidv4();
    client.identityId = identityId;
    client.playerName = payload.playerName;

    // Check if this identity was previously in a session
    const previousSessionId = this.identityToSession.get(identityId);
    if (previousSessionId && this.sessions.has(previousSessionId)) {
      client.previousSessionId = previousSessionId;
    }

    // Send registration confirmation
    this.send(client.ws, {
      type: 'registered',
      payload: {
        identityId,
        playerName: payload.playerName,
        previousSessionId: client.previousSessionId
      }
    });

    console.log(`Client ${clientId} registered as "${payload.playerName}" with identity ${identityId}`);
  }

  private handleListSessions(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const sessions = this.getSessionList();
    
    this.send(client.ws, {
      type: 'sessions_list',
      payload: {
        sessions,
        previousSessionId: client.previousSessionId
      }
    });
  }

  private handleCreateSession(clientId: string, payload: CreateSessionPayload): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (!client.identityId) {
      this.sendError(client.ws, 'Must register first', 'NOT_REGISTERED');
      return;
    }

    // Create new session
    const sessionId = uuidv4();
    const settings: GameSettings = {
      ...DEFAULT_SETTINGS,
      ...payload.settings
    };

    const session = new GameSession(
      sessionId,
      payload.sessionName,
      settings,
      (ws, msg) => this.sendToClient(ws, msg),
      () => this.broadcastSessionUpdate(),
      this.publicIp,
      this.port
    );

    this.sessions.set(sessionId, session);
    client.currentSessionId = sessionId;
    
    // Track this identity's session for reconnection
    this.identityToSession.set(client.identityId, sessionId);

    // Send session created confirmation
    this.send(client.ws, {
      type: 'session_created',
      payload: {
        sessionId,
        sessionName: payload.sessionName
      }
    });

    // Auto-join the session as host
    session.handleMessage(clientId, client.ws, client.ip, client.identityId, {
      type: 'join_game',
      payload: { playerName: payload.hostName }
    });

    console.log(`Session "${payload.sessionName}" created by ${payload.hostName}`);
    this.broadcastSessionUpdate();
  }

  private handleJoinSession(clientId: string, payload: JoinSessionPayload): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (!client.identityId) {
      this.sendError(client.ws, 'Must register first', 'NOT_REGISTERED');
      return;
    }

    const session = this.sessions.get(payload.sessionId);
    if (!session) {
      this.sendError(client.ws, 'Session not found', 'SESSION_NOT_FOUND');
      return;
    }

    // Check if session is full
    const sessionInfo = session.getSessionInfo();
    if (sessionInfo.playerCount >= sessionInfo.maxPlayers && 
        !session.hasDisconnectedPlayer(payload.playerName)) {
      this.sendError(client.ws, 'Session is full', 'SESSION_FULL');
      return;
    }

    client.currentSessionId = payload.sessionId;
    client.playerName = payload.playerName;
    
    // Track this identity's session for reconnection
    this.identityToSession.set(client.identityId, payload.sessionId);

    // Send session joined confirmation
    this.send(client.ws, {
      type: 'session_joined',
      payload: {
        sessionId: payload.sessionId,
        sessionName: session.getSessionInfo().name
      }
    });

    // Join the game within the session
    session.handleMessage(clientId, client.ws, client.ip, client.identityId, {
      type: 'join_game',
      payload: { playerName: payload.playerName }
    });

    console.log(`${payload.playerName} joined session "${session.getSessionInfo().name}"`);
  }

  private handleLeaveSession(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.currentSessionId) return;

    const session = this.sessions.get(client.currentSessionId);
    if (session) {
      session.handleDisconnect(clientId);
    }

    const sessionName = session?.getSessionInfo().name || 'Unknown';
    client.currentSessionId = null;

    // Send confirmation
    this.send(client.ws, {
      type: 'session_left',
      payload: {}
    });

    // Send updated session list
    this.handleListSessions(clientId);

    console.log(`${client.playerName} left session "${sessionName}"`);
    this.broadcastSessionUpdate();
  }

  private handleUpdateSessionSettings(clientId: string, payload: { mode?: string; maxPlayers?: number }): void {
    const client = this.clients.get(clientId);
    if (!client || !client.currentSessionId) {
      this.sendError(client?.ws!, 'Not in a session', 'NOT_IN_SESSION');
      return;
    }

    const session = this.sessions.get(client.currentSessionId);
    if (!session) {
      this.sendError(client.ws, 'Session not found', 'SESSION_NOT_FOUND');
      return;
    }

    // Check if client is the host
    if (!session.isPlayerHost(clientId)) {
      this.sendError(client.ws, 'Only the host can change settings', 'NOT_HOST');
      return;
    }

    // Update settings
    session.updateSettings(payload);

    // Broadcast updated settings to all players in the session
    const updatedSettings = session.getSettings();
    this.broadcastToSession(client.currentSessionId, {
      type: 'session_settings_updated',
      payload: {
        mode: updatedSettings.mode,
        maxPlayers: updatedSettings.maxPlayers
      }
    });

    // Broadcast game state update so UI reflects new settings (e.g., slot count)
    session.broadcastGameState();

    console.log(`Session settings updated by ${client.playerName}: mode=${payload.mode}, maxPlayers=${payload.maxPlayers}`);
    this.broadcastSessionUpdate();
  }

  private handleDeleteSession(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.currentSessionId) {
      this.sendError(client?.ws!, 'Not in a session', 'NOT_IN_SESSION');
      return;
    }

    const sessionId = client.currentSessionId;
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendError(client.ws, 'Session not found', 'SESSION_NOT_FOUND');
      return;
    }

    // Check if client is the host
    if (!session.isPlayerHost(clientId)) {
      this.sendError(client.ws, 'Only the host can delete the session', 'NOT_HOST');
      return;
    }

    const sessionName = session.getSessionInfo().name;

    // Notify all players in the session and return them to browser
    this.broadcastToSession(sessionId, {
      type: 'session_deleted',
      payload: {}
    });

    // Clear session references for all clients in this session
    for (const [cid, c] of this.clients.entries()) {
      if (c.currentSessionId === sessionId) {
        c.currentSessionId = null;
        // Clear identity-to-session mapping
        this.identityToSession.delete(c.identityId);
      }
    }

    // Delete the session
    this.sessions.delete(sessionId);

    console.log(`Session "${sessionName}" deleted by ${client.playerName}`);
    this.broadcastSessionUpdate();
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // If in a session, notify the session
    if (client.currentSessionId) {
      const session = this.sessions.get(client.currentSessionId);
      if (session) {
        session.handleDisconnect(clientId);
      }
    }

    this.clients.delete(clientId);
    console.log(`Client ${clientId} disconnected`);
    this.broadcastSessionUpdate();
  }

  private getSessionList(): SessionInfo[] {
    const sessions: SessionInfo[] = [];
    for (const session of this.sessions.values()) {
      sessions.push(session.getSessionInfo());
    }
    // Sort by creation time (newest first)
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  private getTotalPlayerCount(): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      count += session.getConnectedPlayerCount();
    }
    return count;
  }

  private broadcastSessionUpdate(): void {
    // Send updated session list to all clients not in a session
    const sessions = this.getSessionList();
    for (const [clientId, client] of this.clients.entries()) {
      if (!client.currentSessionId && client.identityId) {
        this.send(client.ws, {
          type: 'session_updated',
          payload: {
            sessions,
            previousSessionId: client.previousSessionId
          }
        });
      }
    }
  }

  private sendToClient(ws: WebSocket, message: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    this.sendToClient(ws, message);
  }

  private broadcastToSession(sessionId: string, message: ServerMessage): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (client.currentSessionId === sessionId) {
        this.send(client.ws, message);
      }
    }
  }

  private sendError(ws: WebSocket, message: string, code: string): void {
    this.send(ws, {
      type: 'error',
      payload: { message, code }
    });
  }

  private startCleanupTask(): void {
    // Clean up stale sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 5 * 60 * 1000);
  }

  private cleanupStaleSessions(): void {
    const staleSessionIds: string[] = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.isStale()) {
        staleSessionIds.push(sessionId);
      }
    }

    for (const sessionId of staleSessionIds) {
      this.sessions.delete(sessionId);
      console.log(`Cleaned up stale session: ${sessionId}`);
    }

    if (staleSessionIds.length > 0) {
      this.broadcastSessionUpdate();
    }
  }

  public async fetchPublicIp(): Promise<string> {
    try {
      const https = await import('https');
      return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org', (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            this.publicIp = data.trim();
            resolve(this.publicIp);
          });
        }).on('error', (err) => {
          console.error('Failed to fetch public IP:', err);
          this.publicIp = 'Unknown';
          resolve('Unknown');
        });
      });
    } catch (error) {
      console.error('Failed to fetch public IP:', error);
      this.publicIp = 'Unknown';
      return 'Unknown';
    }
  }

  public async start(): Promise<void> {
    await this.fetchPublicIp();
    
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log('========================================');
        console.log('    Perudo+ Session Manager Started');
        console.log('========================================');
        console.log(`Local:     http://localhost:${this.port}`);
        console.log(`Public IP: ${this.publicIp}`);
        console.log(`Port:      ${this.port}`);
        console.log('========================================');
        console.log('Players connect to browse and join');
        console.log('game sessions, or create their own.');
        console.log('========================================');
        resolve();
      });
    });
  }

  public stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.wss.close();
    this.server.close();
    console.log('Session Manager stopped');
  }

  public getPublicIp(): string {
    return this.publicIp;
  }

  public getPort(): number {
    return this.port;
  }
}
