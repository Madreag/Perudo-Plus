// ============================================
// Perudo+ Network Client (Browser)
// ============================================

import {
  ClientMessage,
  ServerMessage,
  PublicGameState,
  PrivateInfoPayload,
  Die,
  Card,
  Bid,
  DudoResult,
  JontiResult,
  SessionInfo,
  GameSettings,
  BrowserPlayerInfo
} from '../shared/types';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

export interface NetworkClientEvents {
  // Session management events
  onRegistered: (identityId: string, playerName: string, previousSessionId: string | null) => void;
  onSessionsList: (sessions: SessionInfo[], previousSessionId: string | null, browserPlayers: BrowserPlayerInfo[]) => void;
  onSessionCreated: (sessionId: string, sessionName: string) => void;
  onSessionJoined: (sessionId: string, sessionName: string) => void;
  onSessionLeft: () => void;
  onSessionUpdated: (sessions: SessionInfo[], previousSessionId: string | null, browserPlayers: BrowserPlayerInfo[]) => void;
  onSessionSettingsUpdated: (settings: { mode: string; maxPlayers: number; stage: string }) => void;
  onSessionDeleted: () => void;
  onBrowserPlayersList: (players: BrowserPlayerInfo[]) => void;
  onBrowserChat: (identityId: string, playerName: string, message: string) => void;
  // Game events
  onConnectionStateChange: (state: ConnectionState) => void;
  onConnectionAccepted: (playerId: string, isHost: boolean) => void;
  onGameStateUpdate: (state: PublicGameState) => void;
  onPrivateInfo: (info: PrivateInfoPayload) => void;
  onPlayerJoined: (playerId: string, playerName: string) => void;
  onPlayerLeft: (playerId: string, playerName: string) => void;
  onBidMade: (playerId: string, bid: Bid) => void;
  onDudoCalled: (callerId: string, callerName: string) => void;
  onDudoResult: (result: DudoResult, cardDrawInfo?: { playerId: string; playerName: string }) => void;
  onJontiCalled: (callerId: string, callerName: string) => void;
  onJontiResult: (result: JontiResult) => void;
  onRoundStarted: (roundNumber: number) => void;
  onGameOver: (winnerId: string, winnerName: string) => void;
  onCardPlayed: (playerId: string, cardType: string, cardName: string, result?: any) => void;
  onCardDrawn: (card: Card) => void;
  onPlayerDrewCard: (playerId: string, playerName: string) => void;
  onChat: (playerId: string, playerName: string, message: string) => void;
  onError: (message: string, code: string) => void;
  onServerInfo: (publicIp: string, port: number) => void;
  onGamePaused: (pausedBy: string) => void;
  onGameResumed: (resumedBy: string) => void;
  onPlayerKicked: (reason: string) => void;
}


export class NetworkClient {
  private ws: WebSocket | null = null;
  private serverUrl: string = '';
  private connectionState: ConnectionState = 'disconnected';
  private events: Partial<NetworkClientEvents> = {};
  private playerId: string = '';
  private isHost: boolean = false;
  private identityId: string = '';
  private currentSessionId: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor() {
    // Load identity from localStorage if available
    const savedIdentity = localStorage.getItem('perudo_identity');
    if (savedIdentity) {
      this.identityId = savedIdentity;
    }
  }

  public on<K extends keyof NetworkClientEvents>(
    event: K,
    callback: NetworkClientEvents[K]
  ): void {
    this.events[event] = callback;
  }

  public connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverUrl = `ws://${host}:${port}`;
      this.setConnectionState('connecting');

      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log('Connected to server');
          this.setConnectionState('connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onclose = () => {
          console.log('Disconnected from server');
          this.setConnectionState('disconnected');
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing server message:', error);
          }
        };
      } catch (error) {
        this.setConnectionState('disconnected');
        reject(error);
      }
    });
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState('disconnected');
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.events.onConnectionStateChange?.(state);
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Attempting to reconnect in ${delay}ms...`);
    setTimeout(() => {
      if (this.connectionState === 'disconnected') {
        const [host, portStr] = this.serverUrl.replace('ws://', '').split(':');
        this.connect(host, parseInt(portStr, 10)).catch(() => {});
      }
    }, delay);
  }

  private handleMessage(message: ServerMessage): void {
    console.log('Received:', message.type);

    switch (message.type) {
      // Session management messages
      case 'registered':
        this.identityId = message.payload.identityId;
        localStorage.setItem('perudo_identity', this.identityId);
        this.events.onRegistered?.(
          message.payload.identityId,
          message.payload.playerName,
          message.payload.previousSessionId
        );
        break;

      case 'sessions_list':
        this.events.onSessionsList?.(
          message.payload.sessions,
          message.payload.previousSessionId,
          message.payload.browserPlayers || []
        );
        break;

      case 'session_created':
        this.currentSessionId = message.payload.sessionId;
        this.events.onSessionCreated?.(
          message.payload.sessionId,
          message.payload.sessionName
        );
        break;

      case 'session_joined':
        this.currentSessionId = message.payload.sessionId;
        this.events.onSessionJoined?.(
          message.payload.sessionId,
          message.payload.sessionName
        );
        break;

      case 'session_left':
        this.currentSessionId = null;
        this.playerId = '';
        this.isHost = false;
        this.events.onSessionLeft?.();
        break;

      case 'session_updated':
        this.events.onSessionUpdated?.(
          message.payload.sessions,
          message.payload.previousSessionId,
          message.payload.browserPlayers || []
        );
        break;

      case 'session_settings_updated':
        this.events.onSessionSettingsUpdated?.(message.payload);
        break;

      case 'session_deleted':
        this.currentSessionId = null;
        this.events.onSessionDeleted?.();
        break;

      case 'browser_players_list':
        this.events.onBrowserPlayersList?.(message.payload.players || []);
        break;

      case 'browser_chat':
        this.events.onBrowserChat?.(
          message.payload.identityId,
          message.payload.playerName,
          message.payload.message
        );
        break;

      // Game messages
      case 'connection_accepted':
        this.playerId = message.payload.playerId;
        this.isHost = message.payload.isHost;
        this.events.onConnectionAccepted?.(this.playerId, this.isHost);
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'player_joined':
        this.events.onPlayerJoined?.(
          message.payload.playerId,
          message.payload.playerName
        );
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'player_left':
        this.events.onPlayerLeft?.(
          message.payload.playerId,
          message.payload.playerName
        );
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'game_started':
      case 'game_state_update':
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'private_info':
        this.events.onPrivateInfo?.(message.payload);
        break;

      case 'bid_made':
        this.events.onBidMade?.(message.payload.playerId, message.payload.bid);
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'dudo_called':
        this.events.onDudoCalled?.(
          message.payload.callerId,
          message.payload.callerName
        );
        break;

      case 'dudo_result':
        this.events.onDudoResult?.(message.payload.result, message.payload.cardDrawInfo);
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'jonti_called':
        this.events.onJontiCalled?.(
          message.payload.callerId,
          message.payload.callerName
        );
        break;

      case 'jonti_result':
        this.events.onJontiResult?.(message.payload.result);
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'round_started':
        this.events.onRoundStarted?.(message.payload.roundNumber);
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'game_over':
        this.events.onGameOver?.(
          message.payload.winnerId,
          message.payload.winnerName
        );
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'card_played':
        this.events.onCardPlayed?.(
          message.payload.playerId,
          message.payload.cardType,
          message.payload.cardName,
          message.payload.result
        );
        if (message.payload.gameState) {
          this.events.onGameStateUpdate?.(message.payload.gameState);
        }
        break;

      case 'card_drawn':
        this.events.onCardDrawn?.(message.payload.card);
        break;

      case 'player_drew_card':
        this.events.onPlayerDrewCard?.(
          message.payload.playerId,
          message.payload.playerName
        );
        break;

      case 'chat':
        this.events.onChat?.(
          message.payload.playerId,
          message.payload.playerName,
          message.payload.message
        );
        break;

      case 'server_info':
        this.events.onServerInfo?.(
          message.payload.publicIp,
          message.payload.port
        );
        break;

      case 'game_paused':
        this.events.onGamePaused?.(message.payload.pausedBy);
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'game_resumed':
        this.events.onGameResumed?.(message.payload.resumedBy);
        this.events.onGameStateUpdate?.(message.payload.gameState);
        break;

      case 'error':
        this.events.onError?.(message.payload.message, message.payload.code);
        break;

      case 'player_kicked':
        this.events.onPlayerKicked?.(message.payload.reason);
        break;

      default:
        console.log('Unknown message type:', (message as any).type);
    }
  }

  private send(message: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message: not connected');
    }
  }

  // Session management API methods
  public register(playerName: string): void {
    this.send({
      type: 'register',
      payload: { 
        identityId: this.identityId || undefined,
        playerName 
      }
    });
  }

  public listSessions(): void {
    this.send({
      type: 'list_sessions',
      payload: {}
    });
  }

  public createSession(sessionName: string, hostName: string, settings?: Partial<GameSettings>): void {
    this.send({
      type: 'create_session',
      payload: { sessionName, hostName, settings }
    });
  }

  public joinSession(sessionId: string, playerName: string): void {
    this.send({
      type: 'join_session',
      payload: { sessionId, playerName }
    });
  }

  public leaveSession(): void {
    this.send({
      type: 'leave_session',
      payload: {}
    });
  }

  public updateSessionSettings(settings: { mode?: string; maxPlayers?: number; stage?: string }): void {
    this.send({
      type: 'update_session_settings',
      payload: settings
    });
  }

  public deleteSession(): void {
    this.send({
      type: 'delete_session',
      payload: {}
    });
  }

  // Game API methods
  public joinGame(playerName: string): void {
    this.send({
      type: 'join_game',
      payload: { playerName }
    });
  }

  public startGame(): void {
    this.send({
      type: 'start_game',
      payload: {}
    });
  }

  public requestNewGame(): void {
    this.send({
      type: 'new_game',
      payload: {}
    });
  }

  public makeBid(quantity: number, faceValue: number): void {
    this.send({
      type: 'make_bid',
      payload: { quantity, faceValue }
    });
  }

  public callDudo(): void {
    this.send({
      type: 'call_dudo',
      payload: {}
    });
  }

  public callJonti(): void {
    this.send({
      type: 'call_jonti',
      payload: {}
    });
  }

  public playCard(
    cardId: string,
    targetPlayerId?: string,
    targetDieId?: string,
    additionalData?: any
  ): void {
    this.send({
      type: 'play_card',
      payload: {
        cardId,
        targetPlayerId,
        targetDieId,
        additionalData
      }
    });
  }

  public readyForRound(): void {
    this.send({
      type: 'ready_for_round',
      payload: {}
    });
  }

  public pauseGame(): void {
    this.send({
      type: 'pause_game',
      payload: {}
    });
  }

  public resumeGame(): void {
    this.send({
      type: 'resume_game',
      payload: {}
    });
  }

  public sendChat(message: string): void {
    this.send({
      type: 'chat',
      payload: { message }
    });
  }

  public sendBrowserChat(message: string): void {
    this.send({
      type: 'browser_chat',
      payload: { message }
    });
  }

  public kickPlayer(playerId: string): void {
    this.send({
      type: 'kick_player',
      payload: { playerId }
    });
  }

  public selectSlot(slot: number | null): void {
    this.send({
      type: 'select_slot',
      payload: { slot }
    });
  }

  public addAIPlayer(slot: number, difficulty: string): void {
    this.send({
      type: 'add_ai_player',
      payload: { slot, difficulty }
    });
  }

  public removeAIPlayer(playerId: string): void {
    this.send({
      type: 'remove_ai_player',
      payload: { playerId }
    });
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getIsHost(): boolean {
    return this.isHost;
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public getIdentityId(): string {
    return this.identityId;
  }

  public getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  public isInSession(): boolean {
    return this.currentSessionId !== null;
  }
}
