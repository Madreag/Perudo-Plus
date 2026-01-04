// ============================================
// Perudo+ Game Session
// Handles game logic for a single game session
// ============================================

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  GameSettings,
  Player,
  ClientMessage,
  ServerMessage,
  JoinGamePayload,
  MakeBidPayload,
  PlayCardPayload,
  PrivateInfoPayload,
  Card,
  SessionInfo
} from '../shared/types';
import {
  createGameState,
  createPlayer,
  addPlayer,
  removePlayer,
  startGame,
  rollDiceForRound,
  makeBid,
  callDudo,
  callLateDudo,
  callJonti,
  applyDudoResult,
  applyJontiResult,
  startNewRound,
  toPublicGameState,
  applyRerollOne,
  applyPolish,
  applyCrack,
  applyInflation,
  applyWildShift,
  removeCardFromHand,
  resetGame,
  setActiveEffect,
  pauseGame,
  resumeGame
} from '../shared/gameState';
import { createDeck } from '../shared/cards';
import { AIFactory, AIPlayer } from './ai/AIFactory';
import { AIDifficulty, AIDecision } from '../types/AI';


export interface SessionClient {
  ws: WebSocket;
  odentityId: string;  // Persistent identity across reconnects
  playerId: string;
  playerName: string;
  ip: string;
}

export class GameSession {
  public readonly id: string;
  public readonly name: string;
  public readonly createdAt: number;
  
  private gameState: GameState;
  private clients: Map<string, SessionClient> = new Map(); // clientId -> SessionClient
  private deck: Card[] = [];
  private aiPlayers: Map<string, AIPlayer> = new Map(); // playerId -> AIPlayer
  private aiTurnTimeout: NodeJS.Timeout | null = null;
  private sendToClient: (ws: WebSocket, message: ServerMessage) => void;
  private onSessionUpdate: () => void;
  private publicIp: string;
  private port: number;

  constructor(
    id: string,
    name: string,
    settings: GameSettings,
    sendToClient: (ws: WebSocket, message: ServerMessage) => void,
    onSessionUpdate: () => void,
    publicIp: string,
    port: number
  ) {
    this.id = id;
    this.name = name;
    this.createdAt = Date.now();
    this.gameState = createGameState(settings);
    this.sendToClient = sendToClient;
    this.onSessionUpdate = onSessionUpdate;
    this.publicIp = publicIp;
    this.port = port;
  }

  public getSessionInfo(): SessionInfo {
    const host = this.gameState.players.find(p => p.isHost);
    return {
      id: this.id,
      name: this.name,
      hostName: host?.name || 'Unknown',
      playerCount: this.gameState.players.filter(p => p.isConnected).length,
      maxPlayers: this.gameState.settings.maxPlayers,
      phase: this.gameState.phase,
      mode: this.gameState.settings.mode,
      stage: this.gameState.settings.stage,
      createdAt: this.createdAt
    };
  }

  public getGameState(): GameState {
    return this.gameState;
  }

  public getSettings(): GameSettings {
    return this.gameState.settings;
  }

  public updateSettings(settings: { mode?: string; stage?: string; maxPlayers?: number; aiDifficulty?: string; aiPlayerCount?: number }): void {
    if (settings.mode) {
      this.gameState.settings.mode = settings.mode as 'classic' | 'tactical' | 'chaos';
    }
    if (settings.stage) {
      this.gameState.settings.stage = settings.stage as 'casino' | 'dungeon' | 'beach';
    }
    if (settings.maxPlayers !== undefined) {
      const newMaxPlayers = settings.maxPlayers;
      this.gameState.settings.maxPlayers = newMaxPlayers;
      
      // Unassign players from slots that no longer exist
      this.gameState = {
        ...this.gameState,
        players: this.gameState.players.map(p => {
          if (p.slot !== null && p.slot >= newMaxPlayers) {
            return { ...p, slot: null };
          }
          return p;
        })
      };
    }
    if (settings.aiDifficulty) {
      this.gameState.settings.aiDifficulty = settings.aiDifficulty as AIDifficulty;
    }
    if (settings.aiPlayerCount !== undefined) {
      this.gameState.settings.aiPlayerCount = Math.max(0, Math.min(5, settings.aiPlayerCount));
      this.updateAIPlayers();
    }
  }

  /**
   * Update AI players based on settings
   */
  private updateAIPlayers(): void {
    const targetCount = this.gameState.settings.aiPlayerCount;
    const currentAICount = this.aiPlayers.size;
    const difficulty = this.gameState.settings.aiDifficulty as AIDifficulty;

    if (targetCount > currentAICount) {
      // Add AI players
      for (let i = currentAICount; i < targetCount; i++) {
        const aiPlayer = AIFactory.createAIPlayer(difficulty);
        this.aiPlayers.set(aiPlayer.id, aiPlayer);
        
        // Create player object and add to game state
        const player = AIFactory.createPlayerFromAI(aiPlayer);
        this.gameState = addPlayer(this.gameState, player);
        
        console.log(`[Session ${this.name}] Added AI player: ${aiPlayer.name}`);
      }
    } else if (targetCount < currentAICount) {
      // Remove AI players
      const aiIds = Array.from(this.aiPlayers.keys());
      for (let i = currentAICount - 1; i >= targetCount; i--) {
        const aiId = aiIds[i];
        const aiPlayer = this.aiPlayers.get(aiId);
        this.aiPlayers.delete(aiId);
        
        // Remove from game state
        this.gameState = {
          ...this.gameState,
          players: this.gameState.players.filter(p => p.id !== aiId)
        };
        
        console.log(`[Session ${this.name}] Removed AI player: ${aiPlayer?.name}`);
      }
    }
  }

  public isPlayerHost(clientId: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    const player = this.gameState.players.find(p => p.id === client.playerId);
    return player?.isHost || false;
  }

  public getConnectedPlayerCount(): number {
    return this.gameState.players.filter(p => p.isConnected).length;
  }

  public hasPlayer(identityId: string): boolean {
    return Array.from(this.clients.values()).some(c => c.odentityId === identityId);
  }

  public hasDisconnectedPlayer(playerName: string): boolean {
    return this.gameState.players.some(p => p.name === playerName && !p.isConnected);
  }

  public handleMessage(clientId: string, ws: WebSocket, clientIp: string, identityId: string, message: ClientMessage): void {
    console.log(`[Session ${this.name}] Received message from ${clientId}:`, message.type);

    switch (message.type) {
      case 'join_game':
        this.handleJoinGame(clientId, ws, clientIp, identityId, message.payload as JoinGamePayload);
        break;
      case 'start_game':
        this.handleStartGame(clientId);
        break;
      case 'make_bid':
        this.handleMakeBid(clientId, message.payload as MakeBidPayload);
        break;
      case 'call_dudo':
        this.handleCallDudo(clientId);
        break;
      case 'call_jonti':
        this.handleCallJonti(clientId);
        break;
      case 'call_late_dudo':
        this.handleCallLateDudo(clientId, message.payload?.targetBidIndex);
        break;
      case 'play_card':
        this.handlePlayCard(clientId, message.payload as PlayCardPayload);
        break;
      case 'ready_for_round':
        this.handleReadyForRound(clientId);
        break;
      case 'new_game':
        this.handleNewGame(clientId);
        break;
      case 'pause_game':
        this.handlePauseGame(clientId);
        break;
      case 'resume_game':
        this.handleResumeGame(clientId);
        break;
      case 'chat':
        this.handleChat(clientId, message.payload);
        break;
      case 'kick_player':
        this.handleKickPlayer(clientId, message.payload.playerId);
        break;
      case 'add_ai_player':
        this.handleAddAIPlayer(clientId, message.payload);
        break;
      case 'remove_ai_player':
        this.handleRemoveAIPlayer(clientId, message.payload);
        break;
      case 'select_slot':
        this.handleSelectSlot(clientId, message.payload.slot);
        break;
      default:
        const client = this.clients.get(clientId);
        if (client) {
          this.sendError(client.ws, `Unknown message type: ${message.type}`, 'UNKNOWN_MESSAGE');
        }
    }
  }

  private handleJoinGame(clientId: string, ws: WebSocket, clientIp: string, identityId: string, payload: JoinGamePayload): void {
    try {
      // Check if this is a reconnecting player (same name, disconnected)
      const existingPlayer = this.gameState.players.find(
        p => p.name === payload.playerName && !p.isConnected
      );
      
      console.log(`[Session ${this.name}] Join request from "${payload.playerName}", existing disconnected player found: ${!!existingPlayer}`);

      if (existingPlayer) {
        // Reconnect existing player
        this.gameState = {
          ...this.gameState,
          players: this.gameState.players.map(p =>
            p.id === existingPlayer.id ? { ...p, isConnected: true } : p
          )
        };

        this.clients.set(clientId, { 
          ws, 
          odentityId: identityId,
          playerId: existingPlayer.id, 
          playerName: existingPlayer.name, 
          ip: existingPlayer.ip 
        });

        // Send connection accepted
        this.send(ws, {
          type: 'connection_accepted',
          payload: {
            playerId: existingPlayer.id,
            isHost: existingPlayer.isHost,
            gameState: toPublicGameState(this.gameState)
          }
        });

        // Send server info
        this.send(ws, {
          type: 'server_info',
          payload: {
            publicIp: this.publicIp,
            port: this.port,
            playerCount: this.gameState.players.length,
            maxPlayers: this.gameState.settings.maxPlayers
          }
        });

        // Send private info if game is in progress
        if (this.gameState.phase !== 'lobby' && this.gameState.phase !== 'game_over') {
          this.send(ws, {
            type: 'private_info',
            payload: {
              dice: existingPlayer.dice,
              cards: existingPlayer.cards
            }
          });
        }

        // Notify all other players
        this.broadcastExcept(clientId, {
          type: 'player_joined',
          payload: {
            playerId: existingPlayer.id,
            playerName: existingPlayer.name,
            gameState: toPublicGameState(this.gameState)
          }
        });

        console.log(`[Session ${this.name}] Player ${existingPlayer.name} reconnected`);
        this.onSessionUpdate();
        return;
      }

      // New player joining
      const isHost = this.gameState.players.length === 0;
      const player = createPlayer(payload.playerName, isHost, clientIp);
      
      this.gameState = addPlayer(this.gameState, player);
      this.clients.set(clientId, { 
        ws, 
        odentityId: identityId,
        playerId: player.id, 
        playerName: player.name, 
        ip: clientIp 
      });

      // Send connection accepted to the new player
      this.send(ws, {
        type: 'connection_accepted',
        payload: {
          playerId: player.id,
          isHost,
          gameState: toPublicGameState(this.gameState)
        }
      });

      // Send server info
      this.send(ws, {
        type: 'server_info',
        payload: {
          publicIp: this.publicIp,
          port: this.port,
          playerCount: this.gameState.players.length,
          maxPlayers: this.gameState.settings.maxPlayers
        }
      });

      // Notify all other players
      this.broadcastExcept(clientId, {
        type: 'player_joined',
        payload: {
          playerId: player.id,
          playerName: player.name,
          gameState: toPublicGameState(this.gameState)
        }
      });

      console.log(`[Session ${this.name}] Player ${player.name} joined the game`);
      this.onSessionUpdate();
    } catch (error: any) {
      this.sendError(ws, error.message, 'JOIN_ERROR');
    }
  }

  private handleStartGame(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const player = this.gameState.players.find(p => p.id === client.playerId);
    if (!player?.isHost) {
      this.sendError(client.ws, 'Only the host can start the game', 'NOT_HOST');
      return;
    }

    try {
      this.gameState = startGame(this.gameState);
      
      // Initialize deck for non-classic modes
      if (this.gameState.settings.mode !== 'classic') {
        this.deck = createDeck(this.gameState.settings.mode === 'chaos');
      }

      // Roll dice for the first round
      this.gameState = rollDiceForRound(this.gameState);

      // Broadcast game started
      this.broadcast({
        type: 'game_started',
        payload: {
          gameState: toPublicGameState(this.gameState)
        }
      });

      // Send private info to each player
      this.sendPrivateInfoToAll();

      console.log(`[Session ${this.name}] Game started!`);
      this.onSessionUpdate();
      
      // Check if first turn is AI
      this.checkAndHandleAITurn();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'START_ERROR');
    }
  }

  private handleNewGame(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const player = this.gameState.players.find(p => p.id === client.playerId);
    if (!player?.isHost) {
      this.sendError(client.ws, 'Only the host can start a new game', 'NOT_HOST');
      return;
    }

    try {
      this.gameState = resetGame(this.gameState);

      // Broadcast game reset to all players
      this.broadcast({
        type: 'game_state_update',
        payload: {
          gameState: toPublicGameState(this.gameState)
        }
      });

      console.log(`[Session ${this.name}] Game reset to lobby!`);
      this.onSessionUpdate();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'RESET_ERROR');
    }
  }

  private handlePauseGame(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      this.gameState = pauseGame(this.gameState);

      // Broadcast game paused to all players
      this.broadcast({
        type: 'game_paused',
        payload: {
          pausedBy: client.playerName,
          gameState: toPublicGameState(this.gameState)
        }
      });

      console.log(`[Session ${this.name}] Game paused by ${client.playerName}`);
      this.onSessionUpdate();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'PAUSE_ERROR');
    }
  }

  private handleResumeGame(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      this.gameState = resumeGame(this.gameState);

      // Broadcast game resumed to all players
      this.broadcast({
        type: 'game_resumed',
        payload: {
          resumedBy: client.playerName,
          gameState: toPublicGameState(this.gameState)
        }
      });

      console.log(`[Session ${this.name}] Game resumed by ${client.playerName}`);
      this.onSessionUpdate();
      
      // Check if AI should take turn after game resumes
      this.checkAndHandleAITurn();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'RESUME_ERROR');
    }
  }

  private handleMakeBid(clientId: string, payload: MakeBidPayload): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      this.gameState = makeBid(this.gameState, client.playerId, payload.quantity, payload.faceValue);

      this.broadcast({
        type: 'bid_made',
        payload: {
          playerId: client.playerId,
          bid: this.gameState.currentBid,
          gameState: toPublicGameState(this.gameState)
        }
      });

      console.log(`[Session ${this.name}] ${client.playerName} bid ${payload.quantity}x ${payload.faceValue}s`);
      
      // Check if next turn is AI
      this.checkAndHandleAITurn();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'BID_ERROR');
    }
  }

  private handleCallDudo(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const { newState, result } = callDudo(this.gameState, client.playerId);
      this.gameState = newState;

      // Check for active effects
      const player = this.gameState.players.find(p => p.id === client.playerId);
      const insuranceUsed = player?.activeEffects?.insurance || false;
      const doubleDudo = player?.activeEffects?.doubleDudo || false;

      // Broadcast dudo called
      this.broadcast({
        type: 'dudo_called',
        payload: {
          callerId: client.playerId,
          callerName: client.playerName
        }
      });

      // Apply result with active effects
      const { newState: finalState, cardDrawn } = applyDudoResult(
        this.gameState, 
        result, 
        insuranceUsed, 
        doubleDudo
      );
      this.gameState = finalState;
      
      // Clear the used effects
      if (insuranceUsed) {
        this.gameState = setActiveEffect(this.gameState, client.playerId, 'insurance', false);
      }
      if (doubleDudo) {
        this.gameState = setActiveEffect(this.gameState, client.playerId, 'doubleDudo', false);
      }

      // Include card draw info in dudo_result for delayed animation on client
      const loser = this.gameState.players.find(p => p.id === result.loserId);
      const cardDrawInfo = cardDrawn ? {
        playerId: result.loserId,
        playerName: loser?.name || 'Unknown'
      } : null;

      // Broadcast result with card draw info
      this.broadcast({
        type: 'dudo_result',
        payload: {
          result,
          gameState: toPublicGameState(this.gameState),
          cardDrawInfo
        }
      });

      // Send actual card details only to the player who drew
      if (cardDrawn) {
        const loserClient = Array.from(this.clients.values()).find(
          c => c.playerId === result.loserId
        );
        if (loserClient) {
          this.send(loserClient.ws, {
            type: 'card_drawn',
            payload: { card: cardDrawn }
          });
        }
      }

      // Check for game over
      if (this.gameState.phase === 'game_over') {
        const winner = this.gameState.players.find(p => p.id === this.gameState.winnerId);
        this.broadcast({
          type: 'game_over',
          payload: {
            winnerId: this.gameState.winnerId,
            winnerName: winner?.name,
            gameState: toPublicGameState(this.gameState)
          }
        });
      }

      console.log(`[Session ${this.name}] Dudo called by ${client.playerName}. Result: ${result.success ? 'Success' : 'Failed'}`);
      this.onSessionUpdate();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'DUDO_ERROR');
    }
  }

  private handleCallJonti(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const { newState, result } = callJonti(this.gameState, client.playerId);
      this.gameState = newState;

      // Broadcast jonti called
      this.broadcast({
        type: 'jonti_called',
        payload: {
          callerId: client.playerId,
          callerName: client.playerName
        }
      });

      // Apply result
      const { newState: finalState } = applyJontiResult(this.gameState, result);
      this.gameState = finalState;

      // Broadcast result
      this.broadcast({
        type: 'jonti_result',
        payload: {
          result,
          gameState: toPublicGameState(this.gameState)
        }
      });

      // Check for game over
      if (this.gameState.phase === 'game_over') {
        const winner = this.gameState.players.find(p => p.id === this.gameState.winnerId);
        this.broadcast({
          type: 'game_over',
          payload: {
            winnerId: this.gameState.winnerId,
            winnerName: winner?.name,
            gameState: toPublicGameState(this.gameState)
          }
        });
      }

      console.log(`[Session ${this.name}] Jonti called by ${client.playerName}. Result: ${result.success ? 'Success - gained a die!' : 'Failed - lost a die!'}`);
      this.onSessionUpdate();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'JONTI_ERROR');
    }
  }

  /**
   * Handle Late Dudo call (challenge a previous bid)
   */
  private handleCallLateDudo(clientId: string, targetBidIndex?: number): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const { newState, result } = callLateDudo(this.gameState, client.playerId, targetBidIndex);
      this.gameState = newState;

      // Broadcast late dudo called
      this.broadcast({
        type: 'late_dudo_called',
        payload: {
          callerId: client.playerId,
          callerName: client.playerName,
          challengedBid: result.bid
        }
      });

      // Check for insurance and double dudo effects
      const player = this.gameState.players.find(p => p.id === client.playerId);
      const insuranceUsed = player?.activeEffects?.insurance || false;
      const doubleDudo = player?.activeEffects?.doubleDudo || false;

      // Apply dudo result
      const { newState: finalState, cardDrawn } = applyDudoResult(this.gameState, result, insuranceUsed, doubleDudo);
      this.gameState = finalState;

      // Clear effects after use
      if (insuranceUsed) {
        this.gameState = setActiveEffect(this.gameState, client.playerId, 'insurance', false);
      }
      if (doubleDudo) {
        this.gameState = setActiveEffect(this.gameState, client.playerId, 'doubleDudo', false);
      }

      const loser = this.gameState.players.find(p => p.id === result.loserId);
      const cardDrawInfo = cardDrawn ? {
        playerId: result.loserId,
        playerName: loser?.name || 'Unknown'
      } : null;

      // Broadcast result (reuse dudo_result message type)
      this.broadcast({
        type: 'dudo_result',
        payload: {
          result,
          gameState: toPublicGameState(this.gameState),
          cardDrawInfo,
          isLateDudo: true
        }
      });

      // Update AI models
      for (const [id, ai] of this.aiPlayers) {
        ai.updateModels(this.gameState, id, result);
      }

      // Check for game over
      if (this.gameState.phase === 'game_over') {
        const winner = this.gameState.players.find(p => p.id === this.gameState.winnerId);
        this.broadcast({
          type: 'game_over',
          payload: {
            winnerId: this.gameState.winnerId,
            winnerName: winner?.name,
            gameState: toPublicGameState(this.gameState)
          }
        });
      }

      console.log(`[Session ${this.name}] Late Dudo called by ${client.playerName} on bid ${result.bid.quantity}x${result.bid.faceValue}. Result: ${result.success ? 'Success' : 'Failed'}`);
      this.onSessionUpdate();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'LATE_DUDO_ERROR');
    }
  }

  private handlePlayCard(clientId: string, payload: PlayCardPayload): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const player = this.gameState.players.find(p => p.id === client.playerId);
    if (!player) return;

    const card = player.cards.find(c => c.id === payload.cardId);
    if (!card) {
      this.sendError(client.ws, 'Card not found', 'CARD_NOT_FOUND');
      return;
    }

    try {
      // Validate required parameters before applying card effects
      switch (card.type) {
        case 'reroll_one':
          if (!payload.targetDieId) throw new Error('Must specify die to reroll');
          break;
        case 'polish':
          if (!payload.targetDieId) throw new Error('Must specify die to polish');
          break;
        case 'crack':
          if (!payload.targetPlayerId || (!payload.targetDieId && payload.additionalData?.dieIndex === undefined)) {
            throw new Error('Must specify target player and die');
          }
          break;
        case 'peek':
          if (!payload.targetPlayerId || (!payload.targetDieId && payload.additionalData?.dieIndex === undefined)) {
            throw new Error('Must specify target player and die to peek');
          }
          break;
        case 'gauge':
          if (!payload.additionalData?.dieIds || payload.additionalData.dieIds.length !== 2) {
            throw new Error('Must specify exactly 2 dice to gauge');
          }
          break;
        case 'wild_shift':
          if (!payload.additionalData?.faceValue) throw new Error('Must specify new face value');
          break;
        case 'inflation':
          if (!this.gameState.currentBid) throw new Error('No current bid to inflate');
          break;
        case 'blind_swap':
          if (!payload.targetPlayerId || !payload.targetDieId) {
            throw new Error('Must specify your die and target player');
          }
          break;
      }

      // Apply card effect based on type
      switch (card.type) {
        case 'reroll_one':
          this.gameState = applyRerollOne(this.gameState, client.playerId, payload.targetDieId!);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'reroll_one',
              cardName: card.name,
              result: { message: 'Die re-rolled! Check your dice for the new value.' }
            }
          });
          break;
        case 'polish':
          this.gameState = applyPolish(this.gameState, client.playerId, payload.targetDieId!);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'polish',
              cardName: card.name,
              result: { message: 'Die upgraded! Check your dice for the new type.' }
            }
          });
          break;
        case 'crack':
          {
            let targetDieId = payload.targetDieId;
            if (!targetDieId && payload.additionalData?.dieIndex !== undefined) {
              const targetPlayer = this.gameState.players.find(p => p.id === payload.targetPlayerId);
              if (targetPlayer && targetPlayer.dice[payload.additionalData.dieIndex]) {
                targetDieId = targetPlayer.dice[payload.additionalData.dieIndex].id;
              }
            }
            if (!targetDieId) throw new Error('Could not resolve target die');
            this.gameState = applyCrack(this.gameState, payload.targetPlayerId!, targetDieId);
            const crackedPlayerName = this.gameState.players.find(p => p.id === payload.targetPlayerId)?.name || 'opponent';
            this.send(client.ws, {
              type: 'card_played',
              payload: {
                playerId: client.playerId,
                cardType: 'crack',
                cardName: card.name,
                result: { message: `Cracked ${crackedPlayerName}'s die! Their die has been downgraded.` }
              }
            });
          }
          break;
        case 'inflation':
          this.gameState = applyInflation(this.gameState);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'inflation',
              cardName: card.name,
              result: { 
                message: `Bid inflated! The current bid is now ${this.gameState.currentBid?.quantity}× ${this.gameState.currentBid?.faceValue}s.`
              }
            }
          });
          break;
        case 'wild_shift':
          this.gameState = applyWildShift(this.gameState, payload.additionalData.faceValue);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'wild_shift',
              cardName: card.name,
              result: { 
                message: `Bid shifted! The current bid is now ${this.gameState.currentBid?.quantity}× ${this.gameState.currentBid?.faceValue}s.`
              }
            }
          });
          break;
        case 'peek':
          {
            const targetPlayer = this.gameState.players.find(p => p.id === payload.targetPlayerId);
            let targetDie = targetPlayer?.dice.find(d => d.id === payload.targetDieId);
            if (!targetDie && payload.additionalData?.dieIndex !== undefined && targetPlayer) {
              targetDie = targetPlayer.dice[payload.additionalData.dieIndex];
            }
            if (targetDie) {
              this.send(client.ws, {
                type: 'card_played',
                payload: {
                  playerId: client.playerId,
                  cardType: 'peek',
                  cardName: card.name,
                  result: { die: targetDie }
                }
              });
            } else {
              throw new Error('Could not find target die');
            }
          }
          break;
        case 'gauge':
          {
            const dieInfos: { playerId: string; dieType: string; playerName: string }[] = [];
            for (const dieKey of payload.additionalData.dieIds) {
              const parts = dieKey.split('-');
              const dieIndexStr = parts[parts.length - 1];
              const targetPlayerId = parts.slice(0, -1).join('-');
              const dieIndex = parseInt(dieIndexStr);
              const targetPlayer = this.gameState.players.find(p => p.id === targetPlayerId);
              if (targetPlayer && targetPlayer.dice[dieIndex]) {
                const die = targetPlayer.dice[dieIndex];
                dieInfos.push({ 
                  playerId: targetPlayer.id, 
                  dieType: die.type,
                  playerName: targetPlayer.name
                });
              }
            }
            this.send(client.ws, {
              type: 'card_played',
              payload: {
                playerId: client.playerId,
                cardType: 'gauge',
                cardName: card.name,
                result: { dieInfos }
              }
            });
          }
          break;
        case 'blind_swap':
          this.gameState = this.applyBlindSwap(client.playerId, payload.targetDieId!, payload.targetPlayerId!);
          const swappedPlayerName = this.gameState.players.find(p => p.id === payload.targetPlayerId)?.name || 'opponent';
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'blind_swap',
              cardName: card.name,
              result: { message: `Swapped a die with ${swappedPlayerName}! Check your dice.` }
            }
          });
          break;
        case 'insurance':
          this.gameState = setActiveEffect(this.gameState, client.playerId, 'insurance', true);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'insurance',
              cardName: card.name,
              result: { message: 'Insurance activated! If your next Dudo fails, you won\'t lose a die.' }
            }
          });
          break;
        case 'double_dudo':
          this.gameState = setActiveEffect(this.gameState, client.playerId, 'doubleDudo', true);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'double_dudo',
              cardName: card.name,
              result: { message: 'Double Dudo activated! Your next Dudo has double stakes.' }
            }
          });
          break;
        case 'late_dudo':
          this.gameState = setActiveEffect(this.gameState, client.playerId, 'lateDudo', true);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'late_dudo',
              cardName: card.name,
              result: { message: 'Late Dudo activated! You can call Dudo on a previous bid.' }
            }
          });
          break;
        case 'phantom_bid':
          this.gameState = setActiveEffect(this.gameState, client.playerId, 'phantomBid', true);
          this.send(client.ws, {
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'phantom_bid',
              cardName: card.name,
              result: { message: 'Phantom Bid activated! Your next bid can ignore normal increment rules.' }
            }
          });
          break;
        case 'false_tell':
          this.broadcast({
            type: 'card_played',
            payload: {
              playerId: client.playerId,
              cardType: 'false_tell',
              cardName: card.name,
              result: { message: `${client.playerName} claims to have peeked at a die!` }
            }
          });
          this.gameState = removeCardFromHand(this.gameState, client.playerId, payload.cardId);
          this.sendPrivateInfo(client.playerId);
          console.log(`[Session ${this.name}] ${client.playerName} played ${card.name}`);
          return;
        default:
          console.log(`[Session ${this.name}] Card ${card.type} played but effect not fully implemented`);
      }

      // Remove card from hand
      this.gameState = removeCardFromHand(this.gameState, client.playerId, payload.cardId);

      // Broadcast card played
      this.broadcast({
        type: 'card_played',
        payload: {
          playerId: client.playerId,
          cardType: card.type,
          cardName: card.name,
          gameState: toPublicGameState(this.gameState)
        }
      });

      // Send updated private info
      this.sendPrivateInfo(client.playerId);

      console.log(`[Session ${this.name}] ${client.playerName} played ${card.name}`);
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'CARD_ERROR');
    }
  }

  private handleReadyForRound(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const player = this.gameState.players.find(p => p.id === client.playerId);
    if (!player?.isHost) return;

    if (this.gameState.phase !== 'round_end') return;

    try {
      this.gameState = startNewRound(this.gameState);
      this.gameState = rollDiceForRound(this.gameState);

      this.broadcast({
        type: 'round_started',
        payload: {
          roundNumber: this.gameState.roundNumber,
          gameState: toPublicGameState(this.gameState)
        }
      });

      this.sendPrivateInfoToAll();

      console.log(`[Session ${this.name}] Round ${this.gameState.roundNumber} started`);
      this.onSessionUpdate();
      
      // Check if AI should take turn after round starts
      this.checkAndHandleAITurn();
    } catch (error: any) {
      this.sendError(client.ws, error.message, 'ROUND_ERROR');
    }
  }

  private handleChat(clientId: string, payload: { message: string }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.broadcast({
      type: 'chat',
      payload: {
        playerId: client.playerId,
        playerName: client.playerName,
        message: payload.message,
        timestamp: Date.now()
      }
    });
  }

  public handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Mark player as disconnected
    this.gameState = {
      ...this.gameState,
      players: this.gameState.players.map(p =>
        p.id === client.playerId ? { ...p, isConnected: false } : p
      )
    };

    this.clients.delete(clientId);

    // Check if all players are disconnected during an active game
    const allDisconnected = this.gameState.players.every(p => !p.isConnected);
    const isActiveGame = this.gameState.phase !== 'lobby' && this.gameState.phase !== 'game_over';
    
    if (allDisconnected && isActiveGame) {
      this.gameState = {
        ...this.gameState,
        pausedFromPhase: this.gameState.phase,
        phase: 'paused'
      };
      console.log(`[Session ${this.name}] All players disconnected - game auto-paused from phase: ${this.gameState.pausedFromPhase}`);
    }

    this.broadcast({
      type: 'player_left',
      payload: {
        playerId: client.playerId,
        playerName: client.playerName,
        gameState: toPublicGameState(this.gameState)
      }
    });

    console.log(`[Session ${this.name}] Player ${client.playerName} disconnected`);
    this.onSessionUpdate();
  }

  private handleKickPlayer(clientId: string, targetPlayerId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const requestingPlayer = this.gameState.players.find(p => p.id === client.playerId);
    if (!requestingPlayer?.isHost) {
      this.sendError(client.ws, 'Only the host can kick players', 'NOT_HOST');
      return;
    }

    if (targetPlayerId === client.playerId) {
      this.sendError(client.ws, 'Cannot kick yourself', 'KICK_ERROR');
      return;
    }

    const targetPlayer = this.gameState.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      this.sendError(client.ws, 'Player not found', 'PLAYER_NOT_FOUND');
      return;
    }

    this.gameState = {
      ...this.gameState,
      players: this.gameState.players.filter(p => p.id !== targetPlayerId)
    };

    for (const [cid, c] of this.clients.entries()) {
      if (c.playerId === targetPlayerId) {
        this.send(c.ws, {
          type: 'player_kicked',
          payload: { reason: 'You have been kicked by the host' }
        });
        c.ws.close();
        this.clients.delete(cid);
        break;
      }
    }

    this.broadcast({
      type: 'player_left',
      payload: {
        playerId: targetPlayerId,
        playerName: targetPlayer.name,
        gameState: toPublicGameState(this.gameState)
      }
    });

    console.log(`[Session ${this.name}] Player ${targetPlayer.name} was kicked by ${requestingPlayer.name}`);
    this.onSessionUpdate();
  }

  private handleSelectSlot(clientId: string, slot: number | null): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (this.gameState.phase !== 'lobby') {
      this.sendError(client.ws, 'Cannot change slots during game', 'SLOT_ERROR');
      return;
    }

    if (slot !== null && (slot < 0 || slot >= this.gameState.settings.maxPlayers)) {
      this.sendError(client.ws, 'Invalid slot number', 'SLOT_ERROR');
      return;
    }

    if (slot !== null) {
      const slotTaken = this.gameState.players.some(
        p => p.slot === slot && p.id !== client.playerId
      );
      if (slotTaken) {
        this.sendError(client.ws, 'Slot is already taken', 'SLOT_TAKEN');
        return;
      }
    }

    this.gameState = {
      ...this.gameState,
      players: this.gameState.players.map(p =>
        p.id === client.playerId ? { ...p, slot } : p
      )
    };

    this.broadcast({
      type: 'game_state_update',
      payload: { gameState: toPublicGameState(this.gameState) }
    });

    console.log(`[Session ${this.name}] Player ${client.playerName} selected slot ${slot}`);
  }

  /**
   * Handle adding an AI player to a specific slot
   */
  private handleAddAIPlayer(clientId: string, payload: { slot: number; difficulty: string }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Only host can add AI players
    if (!this.isPlayerHost(clientId)) {
      this.sendError(client.ws, 'Only the host can add AI players', 'NOT_HOST');
      return;
    }

    if (this.gameState.phase !== 'lobby') {
      this.sendError(client.ws, 'Cannot add AI players during game', 'GAME_IN_PROGRESS');
      return;
    }

    const { slot, difficulty } = payload;

    if (slot < 0 || slot >= this.gameState.settings.maxPlayers) {
      this.sendError(client.ws, 'Invalid slot number', 'INVALID_SLOT');
      return;
    }

    // Check if slot is already taken
    const slotTaken = this.gameState.players.some(p => p.slot === slot);
    if (slotTaken) {
      this.sendError(client.ws, 'Slot is already taken', 'SLOT_TAKEN');
      return;
    }

    // Parse difficulty
    const aiDifficulty = AIFactory.parseDifficulty(difficulty);
    
    // Create AI player
    const aiPlayer = AIFactory.createAIPlayer(aiDifficulty);
    this.aiPlayers.set(aiPlayer.id, aiPlayer);
    
    // Create player object and add to game state with the specified slot
    const player = AIFactory.createPlayerFromAI(aiPlayer, slot);
    this.gameState = addPlayer(this.gameState, player);

    // Broadcast updated game state
    this.broadcast({
      type: 'game_state_update',
      payload: { gameState: toPublicGameState(this.gameState) }
    });

    console.log(`[Session ${this.name}] Added AI player ${aiPlayer.name} (${difficulty}) to slot ${slot}`);
    this.onSessionUpdate();
  }

  /**
   * Handle removing an AI player from a slot
   */
  private handleRemoveAIPlayer(clientId: string, payload: { playerId: string }): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Only host can remove AI players
    if (!this.isPlayerHost(clientId)) {
      this.sendError(client.ws, 'Only the host can remove AI players', 'NOT_HOST');
      return;
    }

    if (this.gameState.phase !== 'lobby') {
      this.sendError(client.ws, 'Cannot remove AI players during game', 'GAME_IN_PROGRESS');
      return;
    }

    const { playerId } = payload;
    
    // Find the AI player
    const aiPlayer = this.aiPlayers.get(playerId);
    if (!aiPlayer) {
      this.sendError(client.ws, 'AI player not found', 'AI_NOT_FOUND');
      return;
    }

    // Remove from AI players map
    this.aiPlayers.delete(playerId);

    // Remove from game state
    this.gameState = {
      ...this.gameState,
      players: this.gameState.players.filter(p => p.id !== playerId)
    };

    // Broadcast updated game state
    this.broadcast({
      type: 'game_state_update',
      payload: { gameState: toPublicGameState(this.gameState) }
    });

    console.log(`[Session ${this.name}] Removed AI player ${aiPlayer.name}`);
    this.onSessionUpdate();
  }

  private sendPrivateInfo(playerId: string): void {
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) return;

    const client = Array.from(this.clients.values()).find(c => c.playerId === playerId);
    if (!client) return;

    const privateInfo: PrivateInfoPayload = {
      dice: player.dice,
      cards: player.cards
    };

    this.send(client.ws, {
      type: 'private_info',
      payload: privateInfo
    });
  }

  private sendPrivateInfoToAll(): void {
    for (const player of this.gameState.players) {
      this.sendPrivateInfo(player.id);
    }
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    this.sendToClient(ws, message);
  }

  private sendError(ws: WebSocket, message: string, code: string): void {
    this.send(ws, {
      type: 'error',
      payload: { message, code }
    });
  }

  public broadcastGameState(): void {
    this.broadcast({
      type: 'game_state_update',
      payload: { gameState: toPublicGameState(this.gameState) }
    });
  }

  private broadcast(message: ServerMessage): void {
    for (const client of this.clients.values()) {
      this.send(client.ws, message);
    }
  }

  private broadcastExcept(excludeClientId: string, message: ServerMessage): void {
    for (const [clientId, client] of this.clients.entries()) {
      if (clientId !== excludeClientId) {
        this.send(client.ws, message);
      }
    }
  }

  private applyBlindSwap(playerId: string, myDieId: string, targetPlayerId: string): GameState {
    const targetPlayer = this.gameState.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer || targetPlayer.dice.length === 0) {
      throw new Error('Target player has no dice');
    }
    
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    const myDie = player.dice.find(d => d.id === myDieId);
    if (!myDie) {
      throw new Error('Die not found');
    }
    
    const randomIndex = Math.floor(Math.random() * targetPlayer.dice.length);
    const targetDie = targetPlayer.dice[randomIndex];
    
    const updatedPlayers = this.gameState.players.map(p => {
      if (p.id === playerId) {
        return {
          ...p,
          dice: p.dice.map(d => d.id === myDieId ? { ...targetDie, id: d.id } : d)
        };
      }
      if (p.id === targetPlayerId) {
        return {
          ...p,
          dice: p.dice.map((d, i) => i === randomIndex ? { ...myDie, id: d.id } : d)
        };
      }
      return p;
    });
    
    return { ...this.gameState, players: updatedPlayers };
  }


  /**
   * Check if current turn belongs to an AI player and handle it
   */
  private checkAndHandleAITurn(): void {
    if (this.gameState.phase !== 'bidding') return;
    
    const activePlayers = this.gameState.players.filter(p => !p.isEliminated && p.dice.length > 0);
    if (activePlayers.length === 0) return;
    
    const currentPlayer = activePlayers[this.gameState.currentTurnIndex % activePlayers.length];
    const aiPlayer = this.aiPlayers.get(currentPlayer.id);
    
    if (aiPlayer) {
      // Clear any existing timeout
      if (this.aiTurnTimeout) {
        clearTimeout(this.aiTurnTimeout);
      }
      
      // Add a small delay to make AI feel more natural
      const delay = 1000 + Math.random() * 2000; // 1-3 seconds
      
      this.aiTurnTimeout = setTimeout(async () => {
        await this.executeAITurn(aiPlayer, currentPlayer.id);
      }, delay);
    }
  }

  /**
   * Execute an AI player's turn
   */
  private async executeAITurn(aiPlayer: AIPlayer, playerId: string): Promise<void> {
    try {
      console.log(`[Session ${this.name}] AI ${aiPlayer.name} is thinking...`);
      
      const decision = await aiPlayer.makeDecision(this.gameState, playerId);
      
      console.log(`[Session ${this.name}] AI ${aiPlayer.name} decided: ${decision.action}${decision.bid ? ` (${decision.bid.quantity}x${decision.bid.faceValue})` : ''}`);
      
      // Execute the decision
      switch (decision.action) {
        case 'bid':
          if (decision.bid) {
            this.executeAIBid(playerId, aiPlayer.name, decision.bid.quantity, decision.bid.faceValue);
          } else {
            console.error(`[Session ${this.name}] AI ${aiPlayer.name} decided to bid but no bid data provided`);
            this.executeAIFallback(playerId, aiPlayer.name);
          }
          break;
        
        case 'dudo':
          this.executeAIDudo(playerId, aiPlayer.name);
          break;
        
        case 'jonti':
          this.executeAIJonti(playerId, aiPlayer.name);
          break;
        
        case 'late_dudo':
          this.executeAILateDudo(playerId, aiPlayer.name);
          break;
        
        case 'play_card':
          if (decision.cardPlay) {
            this.executeAICardPlay(playerId, aiPlayer.name, decision.cardPlay);
          } else {
            console.error(`[Session ${this.name}] AI ${aiPlayer.name} decided to play card but no card data provided`);
            this.executeAIFallback(playerId, aiPlayer.name);
          }
          break;

        default:
          console.error(`[Session ${this.name}] AI ${aiPlayer.name} made unknown decision: ${decision.action}`);
          this.executeAIFallback(playerId, aiPlayer.name);
      }

    } catch (error) {
      console.error(`[Session ${this.name}] AI ${aiPlayer.name} error:`, error);
      // Fallback: make a simple bid or call dudo
      this.executeAIFallback(playerId, aiPlayer.name);
    }
  }

  /**
   * Execute AI bid
   */
  private executeAIBid(playerId: string, playerName: string, quantity: number, faceValue: number): void {
    try {
      this.gameState = makeBid(this.gameState, playerId, quantity, faceValue);

      this.broadcast({
        type: 'bid_made',
        payload: {
          playerId,
          bid: this.gameState.currentBid,
          gameState: toPublicGameState(this.gameState)
        }
      });

      console.log(`[Session ${this.name}] AI ${playerName} bid ${quantity}x ${faceValue}s`);
      
      // Check for next AI turn
      this.checkAndHandleAITurn();
    } catch (error: any) {
      console.error(`[Session ${this.name}] AI bid error:`, error.message);
      this.executeAIFallback(playerId, playerName);
    }
  }

  /**
   * Execute AI dudo call
   */
  private executeAIDudo(playerId: string, playerName: string): void {
    try {
      const { newState, result } = callDudo(this.gameState, playerId);
      this.gameState = newState;

      this.broadcast({
        type: 'dudo_called',
        payload: {
          callerId: playerId,
          callerName: playerName
        }
      });

      const { newState: finalState, cardDrawn } = applyDudoResult(this.gameState, result, false, false);
      this.gameState = finalState;

      const loser = this.gameState.players.find(p => p.id === result.loserId);
      const cardDrawInfo = cardDrawn ? {
        playerId: result.loserId,
        playerName: loser?.name || 'Unknown'
      } : null;

      this.broadcast({
        type: 'dudo_result',
        payload: {
          result,
          gameState: toPublicGameState(this.gameState),
          cardDrawInfo
        }
      });

      // Update AI models
      for (const [id, ai] of this.aiPlayers) {
        ai.updateModels(this.gameState, id, result);
      }

      if (this.gameState.phase === 'game_over') {
        const winner = this.gameState.players.find(p => p.id === this.gameState.winnerId);
        this.broadcast({
          type: 'game_over',
          payload: {
            winnerId: this.gameState.winnerId,
            winnerName: winner?.name,
            gameState: toPublicGameState(this.gameState)
          }
        });
      }

      console.log(`[Session ${this.name}] AI ${playerName} called Dudo. Result: ${result.success ? 'Success' : 'Failed'}`);
      
      // AI chat message
      const aiPlayer = this.aiPlayers.get(playerId);
      if (aiPlayer) {
        const chatMsg = aiPlayer.getChatMessage(result.success ? 'dudo_success' : 'dudo_fail');
        if (chatMsg) {
          this.broadcast({
            type: 'chat',
            payload: { playerId, playerName, message: chatMsg }
          });
        }
      }
      
      this.onSessionUpdate();
    } catch (error: any) {
      console.error(`[Session ${this.name}] AI dudo error:`, error.message);
    }
  }

  /**
   * Execute AI jonti call
   */
  private executeAIJonti(playerId: string, playerName: string): void {
    try {
      const { newState, result } = callJonti(this.gameState, playerId);
      this.gameState = newState;

      this.broadcast({
        type: 'jonti_called',
        payload: {
          callerId: playerId,
          callerName: playerName
        }
      });

      const { newState: finalState } = applyJontiResult(this.gameState, result);
      this.gameState = finalState;

      this.broadcast({
        type: 'jonti_result',
        payload: {
          result,
          gameState: toPublicGameState(this.gameState)
        }
      });

      if (this.gameState.phase === 'game_over') {
        const winner = this.gameState.players.find(p => p.id === this.gameState.winnerId);
        this.broadcast({
          type: 'game_over',
          payload: {
            winnerId: this.gameState.winnerId,
            winnerName: winner?.name,
            gameState: toPublicGameState(this.gameState)
          }
        });
      }

      console.log(`[Session ${this.name}] AI ${playerName} called Jonti. Result: ${result.success ? 'Success' : 'Failed'}`);
      
      // AI chat message
      const aiPlayer = this.aiPlayers.get(playerId);
      if (aiPlayer) {
        const chatMsg = aiPlayer.getChatMessage(result.success ? 'jonti_success' : 'jonti_fail');
        if (chatMsg) {
          this.broadcast({
            type: 'chat',
            payload: { playerId, playerName, message: chatMsg }
          });
        }
      }
      
      this.onSessionUpdate();
    } catch (error: any) {
      console.error(`[Session ${this.name}] AI jonti error:`, error.message);
    }
  }

  /**
   * Execute AI late dudo call (challenge a previous bid)
   */
  private executeAILateDudo(playerId: string, playerName: string, targetBidIndex?: number): void {
    try {
      const { newState, result } = callLateDudo(this.gameState, playerId, targetBidIndex);
      this.gameState = newState;

      this.broadcast({
        type: 'late_dudo_called',
        payload: {
          callerId: playerId,
          callerName: playerName,
          challengedBid: result.bid
        }
      });

      // Check for insurance and double dudo effects
      const player = this.gameState.players.find(p => p.id === playerId);
      const insuranceUsed = player?.activeEffects?.insurance || false;
      const doubleDudo = player?.activeEffects?.doubleDudo || false;

      const { newState: finalState, cardDrawn } = applyDudoResult(this.gameState, result, insuranceUsed, doubleDudo);
      this.gameState = finalState;

      // Clear effects after use
      if (insuranceUsed) {
        this.gameState = setActiveEffect(this.gameState, playerId, 'insurance', false);
      }
      if (doubleDudo) {
        this.gameState = setActiveEffect(this.gameState, playerId, 'doubleDudo', false);
      }

      const loser = this.gameState.players.find(p => p.id === result.loserId);
      const cardDrawInfo = cardDrawn ? {
        playerId: result.loserId,
        playerName: loser?.name || 'Unknown'
      } : null;

      this.broadcast({
        type: 'dudo_result',
        payload: {
          result,
          gameState: toPublicGameState(this.gameState),
          cardDrawInfo,
          isLateDudo: true
        }
      });

      // Update AI models
      for (const [id, ai] of this.aiPlayers) {
        ai.updateModels(this.gameState, id, result);
      }

      if (this.gameState.phase === 'game_over') {
        const winner = this.gameState.players.find(p => p.id === this.gameState.winnerId);
        this.broadcast({
          type: 'game_over',
          payload: {
            winnerId: this.gameState.winnerId,
            winnerName: winner?.name,
            gameState: toPublicGameState(this.gameState)
          }
        });
      }

      console.log(`[Session ${this.name}] AI ${playerName} called Late Dudo on bid ${result.bid.quantity}x${result.bid.faceValue}. Result: ${result.success ? 'Success' : 'Failed'}`);
      this.onSessionUpdate();
    } catch (error: any) {
      console.error(`[Session ${this.name}] AI late dudo error:`, error.message);
    }
  }

  /**
   * Execute AI card play
   */
  private executeAICardPlay(playerId: string, playerName: string, cardPlay: any): void {
    try {
      const player = this.gameState.players.find(p => p.id === playerId);
      if (!player) {
        console.error(`[Session ${this.name}] AI ${playerName} player not found`);
        return this.executeAIFallback(playerId, playerName);
      }

      const card = player.cards.find(c => c.id === cardPlay.cardId);
      if (!card) {
        console.error(`[Session ${this.name}] AI ${playerName} tried to play card it doesn't have: ${cardPlay.cardId}`);
        return this.executeAIFallback(playerId, playerName);
      }

      console.log(`[Session ${this.name}] AI ${playerName} playing card: ${card.name} (${card.type})`);

      // Track if this card requires a follow-up action (AI must still act after playing)
      let requiresFollowUp = false;

      // Apply card effect based on type
      switch (card.type) {
        case 'reroll_one':
          if (!cardPlay.targetDieId) {
            // Select worst die to reroll (lowest face value that isn't a 1 if not bidding on 1s)
            const worstDie = this.selectWorstDieToReroll(player.dice);
            if (!worstDie) {
              console.error(`[Session ${this.name}] AI ${playerName} has no dice to reroll`);
              return this.executeAIFallback(playerId, playerName);
            }
            cardPlay.targetDieId = worstDie.id;
          }
          this.gameState = applyRerollOne(this.gameState, playerId, cardPlay.targetDieId);
          break;

        case 'polish':
          if (!cardPlay.targetDieId) {
            // Select best die to upgrade (lowest type that isn't d10)
            const dieToUpgrade = this.selectBestDieToUpgrade(player.dice);
            if (!dieToUpgrade) {
              console.error(`[Session ${this.name}] AI ${playerName} has no dice to upgrade`);
              return this.executeAIFallback(playerId, playerName);
            }
            cardPlay.targetDieId = dieToUpgrade.id;
          }
          this.gameState = applyPolish(this.gameState, playerId, cardPlay.targetDieId);
          break;

        case 'crack':
          if (!cardPlay.targetPlayerId) {
            console.error(`[Session ${this.name}] AI ${playerName} crack card missing target player`);
            return this.executeAIFallback(playerId, playerName);
          }
          {
            const targetPlayer = this.gameState.players.find(p => p.id === cardPlay.targetPlayerId);
            if (!targetPlayer || targetPlayer.dice.length === 0) {
              console.error(`[Session ${this.name}] AI ${playerName} crack target has no dice`);
              return this.executeAIFallback(playerId, playerName);
            }
            // Select best die to crack (highest type)
            let targetDieId = cardPlay.targetDieId;
            if (!targetDieId) {
              const dieToCrack = this.selectBestDieToCrack(targetPlayer.dice);
              targetDieId = dieToCrack?.id || targetPlayer.dice[0].id;
            }
            this.gameState = applyCrack(this.gameState, cardPlay.targetPlayerId, targetDieId);
          }
          break;

        case 'inflation':
          if (!this.gameState.currentBid) {
            console.error(`[Session ${this.name}] AI ${playerName} tried to use inflation with no current bid`);
            return this.executeAIFallback(playerId, playerName);
          }
          this.gameState = applyInflation(this.gameState);
          break;

        case 'wild_shift':
          if (!this.gameState.currentBid) {
            console.error(`[Session ${this.name}] AI ${playerName} tried to use wild_shift with no current bid`);
            return this.executeAIFallback(playerId, playerName);
          }
          {
            const newFaceValue = cardPlay.additionalData?.faceValue || this.selectBestWildShiftFace(player.dice);
            this.gameState = applyWildShift(this.gameState, newFaceValue);
          }
          break;

        case 'peek':
          if (!cardPlay.targetPlayerId) {
            console.error(`[Session ${this.name}] AI ${playerName} peek card missing target player`);
            return this.executeAIFallback(playerId, playerName);
          }
          {
            const targetPlayer = this.gameState.players.find(p => p.id === cardPlay.targetPlayerId);
            if (!targetPlayer || targetPlayer.dice.length === 0) {
              console.error(`[Session ${this.name}] AI ${playerName} peek target has no dice`);
              return this.executeAIFallback(playerId, playerName);
            }
            // Select a random die to peek at if not specified
            let targetDieId = cardPlay.targetDieId;
            if (!targetDieId) {
              const randomIndex = Math.floor(Math.random() * targetPlayer.dice.length);
              targetDieId = targetPlayer.dice[randomIndex].id;
            }
            const targetDie = targetPlayer.dice.find(d => d.id === targetDieId);
            if (targetDie) {
              // Store the peeked information in the AI player's memory
              const aiPlayer = this.aiPlayers.get(playerId);
              if (aiPlayer) {
                aiPlayer.addKnownDice({
                  playerId: cardPlay.targetPlayerId,
                  dieId: targetDieId,
                  dieType: targetDie.type,
                  faceValue: targetDie.faceValue,
                  roundNumber: this.gameState.roundNumber
                });
              }
              console.log(`[Session ${this.name}] AI ${playerName} peeked at ${targetPlayer.name}'s die: ${targetDie.type} showing ${targetDie.faceValue}`);
            }
          }
          requiresFollowUp = true; // Peek doesn't end turn
          break;

        case 'gauge':
          {
            // Gauge shows types of 2 dice (no face values)
            // AI just gains information - the effect is informational
            const dieIds = cardPlay.additionalData?.dieIds;
            if (dieIds && dieIds.length === 2) {
              console.log(`[Session ${this.name}] AI ${playerName} used gauge on 2 dice`);
            } else {
              // Select 2 random dice from opponents
              const opponentDice = this.gameState.players
                .filter(p => p.id !== playerId && !p.isEliminated && p.dice.length > 0)
                .flatMap(p => p.dice.map(d => ({ playerId: p.id, die: d })));
              if (opponentDice.length >= 2) {
                const shuffled = opponentDice.sort(() => Math.random() - 0.5);
                console.log(`[Session ${this.name}] AI ${playerName} gauged: ${shuffled[0].die.type}, ${shuffled[1].die.type}`);
              }
            }
          }
          requiresFollowUp = true; // Gauge doesn't end turn
          break;

        case 'blind_swap':
          if (!cardPlay.targetPlayerId || !cardPlay.targetDieId) {
            // Select worst own die and random opponent
            const worstDie = this.selectWorstDieToReroll(player.dice);
            const opponents = this.gameState.players.filter(p => p.id !== playerId && !p.isEliminated && p.dice.length > 0);
            if (!worstDie || opponents.length === 0) {
              console.error(`[Session ${this.name}] AI ${playerName} cannot blind swap`);
              return this.executeAIFallback(playerId, playerName);
            }
            cardPlay.targetDieId = cardPlay.targetDieId || worstDie.id;
            cardPlay.targetPlayerId = cardPlay.targetPlayerId || opponents[Math.floor(Math.random() * opponents.length)].id;
          }
          this.gameState = this.applyBlindSwap(playerId, cardPlay.targetDieId, cardPlay.targetPlayerId);
          break;

        case 'insurance':
          this.gameState = setActiveEffect(this.gameState, playerId, 'insurance', true);
          console.log(`[Session ${this.name}] AI ${playerName} activated insurance`);
          requiresFollowUp = true; // Insurance is played before dudo, AI needs to call dudo next
          break;

        case 'double_dudo':
          this.gameState = setActiveEffect(this.gameState, playerId, 'doubleDudo', true);
          console.log(`[Session ${this.name}] AI ${playerName} activated double dudo`);
          requiresFollowUp = true; // Double dudo is played before dudo, AI needs to call dudo next
          break;

        case 'late_dudo':
          this.gameState = setActiveEffect(this.gameState, playerId, 'lateDudo', true);
          console.log(`[Session ${this.name}] AI ${playerName} activated late dudo`);
          requiresFollowUp = true; // AI needs to call late dudo next
          break;

        case 'phantom_bid':
          this.gameState = setActiveEffect(this.gameState, playerId, 'phantomBid', true);
          console.log(`[Session ${this.name}] AI ${playerName} activated phantom bid`);
          requiresFollowUp = true; // AI still needs to make a bid
          break;

        case 'false_tell':
          // False tell is just a bluff announcement - no game effect
          console.log(`[Session ${this.name}] AI ${playerName} played false tell (bluff)`);
          requiresFollowUp = true; // AI still needs to make a bid after the bluff
          break;

        default:
          console.log(`[Session ${this.name}] AI ${playerName} card type ${card.type} not implemented`);
          return this.executeAIFallback(playerId, playerName);
      }

      // Remove card from hand
      this.gameState = removeCardFromHand(this.gameState, playerId, cardPlay.cardId);

      // Broadcast card played to all clients
      this.broadcast({
        type: 'card_played',
        payload: {
          playerId,
          cardType: card.type,
          cardName: card.name,
          gameState: toPublicGameState(this.gameState)
        }
      });

      this.onSessionUpdate();

      // If the card requires a follow-up action, trigger AI to continue
      if (requiresFollowUp) {
        // Small delay before follow-up action
        setTimeout(() => {
          this.checkAndHandleAITurn();
        }, 500);
      } else {
        // Card effect complete, check for next turn
        this.checkAndHandleAITurn();
      }

    } catch (error: any) {
      console.error(`[Session ${this.name}] AI card play error:`, error.message);
      this.executeAIFallback(playerId, playerName);
    }
  }

  /**
   * Select the worst die to reroll (highest face value or 1s when not useful)
   */
  private selectWorstDieToReroll(dice: import('../shared/types').Die[]): import('../shared/types').Die | null {
    if (dice.length === 0) return null;
    // Prefer to reroll dice showing high values (less likely to match low bids)
    // or 1s if we're likely bidding on non-1s
    return dice.reduce((worst, die) => {
      // Prioritize rerolling 6s, 5s (less useful as wilds don't help them)
      if (die.faceValue > worst.faceValue) return die;
      return worst;
    }, dice[0]);
  }

  /**
   * Select the best die to upgrade (lowest die type that isn't already d10)
   */
  private selectBestDieToUpgrade(dice: import('../shared/types').Die[]): import('../shared/types').Die | null {
    const upgradeOrder: import('../shared/types').DieType[] = ['d3', 'd4', 'd6', 'd8'];
    for (const type of upgradeOrder) {
      const die = dice.find(d => d.type === type);
      if (die) return die;
    }
    return null; // All dice are d10 or no dice
  }

  /**
   * Select the best opponent die to crack (highest die type)
   */
  private selectBestDieToCrack(dice: import('../shared/types').Die[]): import('../shared/types').Die | null {
    const crackOrder: import('../shared/types').DieType[] = ['d10', 'd8', 'd6', 'd4'];
    for (const type of crackOrder) {
      const die = dice.find(d => d.type === type);
      if (die) return die;
    }
    return dice[0] || null; // Crack d3 as last resort
  }

  /**
   * Select the best face value for wild shift based on own dice
   */
  private selectBestWildShiftFace(dice: import('../shared/types').Die[]): number {
    // Count faces in own hand (including 1s as wilds)
    const counts = [0, 0, 0, 0, 0, 0, 0]; // index 0 unused, 1-6 for faces
    for (const die of dice) {
      counts[die.faceValue]++;
    }
    // Find face with most dice (excluding 1s, add wilds)
    let bestFace = 2;
    let bestCount = 0;
    for (let face = 2; face <= 6; face++) {
      const count = counts[face] + counts[1]; // Include wilds
      if (count > bestCount) {
        bestCount = count;
        bestFace = face;
      }
    }
    return bestFace;
  }

  /**
   * Fallback AI action when primary action fails
   */
  private executeAIFallback(playerId: string, playerName: string): void {
    const { currentBid, players } = this.gameState;
    const totalDice = players.filter(p => !p.isEliminated).reduce((sum, p) => sum + p.dice.length, 0);

    if (!currentBid) {
      // Make opening bid
      this.executeAIBid(playerId, playerName, 1, 2);
    } else if (currentBid.quantity >= totalDice * 0.6) {
      // Bid seems high, call dudo
      this.executeAIDudo(playerId, playerName);
    } else {
      // Make a simple increment
      const newQuantity = currentBid.faceValue < 6 ? currentBid.quantity : currentBid.quantity + 1;
      const newFace = currentBid.faceValue < 6 ? currentBid.faceValue + 1 : 2;
      this.executeAIBid(playerId, playerName, newQuantity, newFace);
    }
  }

  public isEmpty(): boolean {
    return this.gameState.players.every(p => !p.isConnected);
  }

  public isStale(maxAgeMs: number = 3600000): boolean {
    // Consider session stale if empty and older than maxAgeMs (default 1 hour)
    return this.isEmpty() && (Date.now() - this.createdAt > maxAgeMs);
  }
}
