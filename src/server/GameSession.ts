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
      createdAt: this.createdAt
    };
  }

  public getGameState(): GameState {
    return this.gameState;
  }

  public getSettings(): GameSettings {
    return this.gameState.settings;
  }

  public updateSettings(settings: { mode?: string; maxPlayers?: number }): void {
    if (settings.mode) {
      this.gameState.settings.mode = settings.mode as 'classic' | 'tactical' | 'chaos';
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

      // Broadcast result
      this.broadcast({
        type: 'dudo_result',
        payload: {
          result,
          gameState: toPublicGameState(this.gameState)
        }
      });

      // If card was drawn, notify the player
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

  public isEmpty(): boolean {
    return this.gameState.players.every(p => !p.isConnected);
  }

  public isStale(maxAgeMs: number = 3600000): boolean {
    // Consider session stale if empty and older than maxAgeMs (default 1 hour)
    return this.isEmpty() && (Date.now() - this.createdAt > maxAgeMs);
  }
}
