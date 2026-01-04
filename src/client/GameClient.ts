// ============================================
// Perudo+ Game Client
// ============================================

import { NetworkClient } from './NetworkClient';
import { GameRenderer } from './GameRenderer';
import { UIManager } from './UIManager';
import { MusicManager } from './MusicManager';
import { PublicGameState, Die, Card, DudoResult, JontiResult, StageType } from '../shared/types';

export class GameClient {
  private network: NetworkClient;
  private renderer: GameRenderer;
  private ui: UIManager;
  private music: MusicManager;
  private gameState: PublicGameState | null = null;
  private playerIndexMap: Map<string, number> = new Map();
  private previousPhase: string | null = null;
  private cameraPositionedForPlayer: boolean = false;

  constructor(container: HTMLElement) {
    // Create UI container
    const uiContainer = document.createElement('div');
    uiContainer.id = 'ui-container';
    uiContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 100;';
    container.appendChild(uiContainer);

    // Create 3D container
    const renderContainer = document.createElement('div');
    renderContainer.id = 'render-container';
    renderContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    container.appendChild(renderContainer);

    // Initialize components
    this.network = new NetworkClient();
    this.renderer = new GameRenderer(renderContainer);
    this.ui = new UIManager(uiContainer);
    this.music = MusicManager.getInstance();

    // Expose UI for card onclick handlers
    window.gameUI = this.ui;

    // Setup event handlers
    this.setupNetworkEvents();
    this.setupUIEvents();
    
    // Start with lobby music (will play after user interaction unlocks audio)
    this.music.toLobby();
  }

  private setupNetworkEvents(): void {
    this.network.on('onConnectionStateChange', (state) => {
      console.log('Connection state:', state);
      if (state === 'connected') {
        // Connection successful, will receive game state
      } else if (state === 'disconnected') {
        this.ui.showScreen('connection-screen');
        this.ui.showConnectionError('Disconnected from server');
        // Reset previous phase so reconnection triggers proper screen transition
        this.previousPhase = null;
        // Reset camera position flag for next session
        this.cameraPositionedForPlayer = false;
        // Go back to lobby music when disconnected
        this.music.toLobby();
      }
    });

    // Session management events
    this.network.on('onRegistered', (identityId, playerName, previousSessionId) => {
      console.log('Registered with identity:', identityId, 'previousSession:', previousSessionId);
      this.ui.setBrowserPlayerName(playerName);
      // Request session list
      this.network.listSessions();
    });

    this.network.on('onSessionsList', (sessions, previousSessionId, browserPlayers) => {
      console.log('Sessions list:', sessions.length, 'sessions,', browserPlayers.length, 'browser players');
      this.ui.updateSessionList(sessions, previousSessionId);
      this.ui.updateBrowserPlayers(browserPlayers);
    });

    this.network.on('onSessionUpdated', (sessions, previousSessionId, browserPlayers) => {
      console.log('Sessions updated:', sessions.length, 'sessions,', browserPlayers.length, 'browser players');
      this.ui.updateSessionList(sessions, previousSessionId);
      this.ui.updateBrowserPlayers(browserPlayers);
    });

    this.network.on('onBrowserPlayersList', (players) => {
      console.log('Browser players list:', players.length, 'players');
      this.ui.updateBrowserPlayers(players);
    });

    this.network.on('onBrowserChat', (identityId, playerName, message) => {
      console.log('Browser chat from', playerName, ':', message);
      this.ui.addBrowserChatMessage(playerName, message);
    });

    this.network.on('onSessionCreated', (sessionId, sessionName) => {
      console.log('Session created:', sessionId, sessionName);
      // Will receive connection_accepted next
    });

    this.network.on('onSessionJoined', (sessionId, sessionName) => {
      console.log('Joined session:', sessionId, sessionName);
      // Will receive connection_accepted next
    });

    this.network.on('onSessionLeft', () => {
      console.log('Left session');
      this.ui.showScreen('browser-screen');
      this.previousPhase = null;
      // Reset camera position flag for next session
      this.cameraPositionedForPlayer = false;
      this.music.toLobby();
      // Request updated session list
      this.network.listSessions();
    });

    this.network.on('onSessionSettingsUpdated', (settings) => {
      console.log('Session settings updated:', settings);
      this.ui.updateSessionSettings(settings);
      // Update renderer stage if changed
      if (settings.stage) {
        this.renderer.setStage(settings.stage as StageType);
      }
    });

    this.network.on('onSessionDeleted', () => {
      console.log('Session deleted by host');
      this.ui.showScreen('browser-screen');
      this.ui.showNotification('🗑️', 'Session was deleted by the host', 'warning');
      this.previousPhase = null;
      this.music.toLobby();
      // Request updated session list
      this.network.listSessions();
    });

    this.network.on('onConnectionAccepted', (playerId, isHost) => {
      console.log('Connection accepted, playerId:', playerId, 'isHost:', isHost);
      this.ui.setPlayerId(playerId);
      this.ui.setIsHost(isHost);
    });

    this.network.on('onGameStateUpdate', (state) => {
      this.gameState = state;
      this.updatePlayerIndexMap();
      this.ui.updateGameState(state);
      
      // Update renderer stage based on game settings
      if (state.settings?.stage && this.renderer.getStage() !== state.settings.stage) {
        this.renderer.setStage(state.settings.stage);
      }

      // Handle music state transitions based on game phase changes
      if (this.previousPhase !== state.phase) {
        if (state.phase === 'lobby') {
          this.ui.showScreen('lobby-screen');
          // Transition to lobby music
          this.music.toLobby();
        } else if (state.phase === 'rolling' || state.phase === 'bidding' || state.phase === 'dudo_called' || state.phase === 'round_end') {
          this.ui.showScreen('game-screen');
          // Handle music based on previous state
          if (this.previousPhase === 'lobby' || this.previousPhase === null) {
            this.music.toMatchStart();
          } else if (this.previousPhase === 'paused') {
            this.music.toResumed();
          }
        } else if (state.phase === 'game_over') {
          this.ui.showScreen('game-screen');
          // Transition back to lobby music when game ends
          this.music.toMatchEnd();
        } else if (state.phase === 'paused') {
          this.ui.showScreen('game-screen');
          // Transition to paused music state
          this.music.toPaused();
        }
        this.previousPhase = state.phase;
      } else {
        // Switch screens based on phase (no music change)
        if (state.phase === 'lobby') {
          this.ui.showScreen('lobby-screen');
        } else {
          this.ui.showScreen('game-screen');
        }
      }
    });

    this.network.on('onPrivateInfo', (info) => {
      this.ui.updatePrivateInfo(info.dice, info.cards);
      
      // Render player's own dice in 3D
      const myPlayerId = this.network.getPlayerId();
      const myIndex = this.playerIndexMap.get(myPlayerId);
      if (myIndex !== undefined) {
        // Set camera to player's perspective on first private info
        if (!this.cameraPositionedForPlayer) {
          this.renderer.setCameraToPlayerView(myIndex);
          this.cameraPositionedForPlayer = true;
        }
        
        this.renderer.animateDiceRoll(info.dice, myIndex);
      }
      
      // Render shadow dice for other players
      if (this.gameState) {
        this.gameState.players.forEach((player) => {
          if (player.id !== myPlayerId && !player.isEliminated && player.diceCount > 0) {
            const playerIndex = this.playerIndexMap.get(player.id);
            if (playerIndex !== undefined) {
              this.renderer.animateShadowDiceRoll(player.diceCount, playerIndex);
            }
          }
        });
      }
    });

    this.network.on('onPlayerJoined', (playerId, playerName) => {
      this.ui.addSystemMessage(`${playerName} joined the game`);
      this.ui.showNotification('👋', `<b>${playerName}</b> joined the game`, 'success');
    });

    this.network.on('onPlayerLeft', (playerId, playerName) => {
      this.ui.addSystemMessage(`${playerName} left the game`);
      this.ui.showNotification('👋', `<b>${playerName}</b> left the game`, 'warning');
    });

    this.network.on('onBidMade', (playerId, bid) => {
      const playerName = this.gameState?.players.find(p => p.id === playerId)?.name || 'Unknown';
      const isOwnBid = playerId === this.network.getPlayerId();
      this.ui.addSystemMessage(`${playerName} bid ${bid.quantity}× ${bid.faceValue}s`);
      if (!isOwnBid) {
        this.ui.showNotification('🎲', `<b>${playerName}</b> bid ${bid.quantity}× ${bid.faceValue}s`, 'info');
      }
    });

    this.network.on('onDudoCalled', (callerId, callerName) => {
      this.ui.addSystemMessage(`${callerName} called DUDO!`);
      this.ui.showNotification('🚨', `<b>${callerName}</b> called <b>DUDO!</b>`, 'danger');
    });

    this.network.on('onDudoResult', (result, cardDrawInfo) => {
      this.ui.showDudoResult(result, cardDrawInfo);
      
      // Reveal all dice in 3D
      this.renderer.revealAllDice(result.revealedDice, this.playerIndexMap);
    });

    this.network.on('onJontiCalled', (callerId, callerName) => {
      this.ui.addSystemMessage(`${callerName} called JONTI!`);
      this.ui.showNotification('🎯', `<b>${callerName}</b> called <b>JONTI!</b>`, 'warning');
    });

    this.network.on('onJontiResult', (result) => {
      this.ui.showJontiResult(result);
      
      // Reveal all dice in 3D
      this.renderer.revealAllDice(result.revealedDice, this.playerIndexMap);
    });

    this.network.on('onRoundStarted', (roundNumber) => {
      this.ui.addSystemMessage(`Round ${roundNumber} started!`);
      this.ui.showNotification('🎲', `<b>Round ${roundNumber}</b> started!`, 'info');
      this.renderer.clearAllDice();
    });

    this.network.on('onGameOver', (winnerId, winnerName) => {
      this.ui.showGameOver(winnerName);
      // Transition back to lobby music when game ends
      this.music.toMatchEnd();
    });

    this.network.on('onCardPlayed', (playerId, cardType, cardName, result) => {
      const playerName = this.gameState?.players.find(p => p.id === playerId)?.name || 'Unknown';
      const isOwnCard = playerId === this.network.getPlayerId();
      
      // Show notification to other players
      this.ui.showCardPlayedNotification(playerName, cardName, cardType, isOwnCard);
      
      // If this is our card and there's a result, show it
      if (isOwnCard && result) {
        this.ui.showCardResult(cardType, cardName, result);
      }
    });

    this.network.on('onCardDrawn', (card) => {
      // This is only sent to the player who drew - show the card details
      this.ui.addSystemMessage(`You drew: ${card.name}`);
    });

    this.network.on('onChat', (playerId, playerName, message) => {
      this.ui.addChatMessage(playerName, message);
    });

    this.network.on('onServerInfo', (publicIp, port) => {
      this.ui.updateServerInfo(publicIp, port);
    });

    this.network.on('onGamePaused', (pausedBy) => {
      this.ui.addSystemMessage(`Game paused by ${pausedBy}`);
      this.ui.showNotification('⏸️', `Game paused by <b>${pausedBy}</b>`, 'warning');
      this.ui.showPausedOverlay();
      // Music transition handled by onGameStateUpdate
    });

    this.network.on('onGameResumed', (resumedBy) => {
      this.ui.addSystemMessage(`Game resumed by ${resumedBy}`);
      this.ui.showNotification('▶️', `Game resumed by <b>${resumedBy}</b>`, 'success');
      this.ui.hidePausedOverlay();
      // Music transition handled by onGameStateUpdate
    });

    this.network.on('onError', (message, code) => {
      console.error(`Error [${code}]: ${message}`);
      this.ui.addSystemMessage(`Error: ${message}`);
    });

    this.network.on('onPlayerKicked', (reason) => {
      this.ui.showScreen('connection-screen');
      this.ui.showConnectionError(reason);
      this.music.toLobby();
    });
  }

  private setupUIEvents(): void {
    // Volume control
    this.ui.onVolumeChange = (volume) => {
      this.music.setVolume(volume);
    };

    // Connection - auto-detect host/port from current URL
    this.ui.onConnect = async (playerName) => {
      try {
        // Use current page's hostname and port
        const host = window.location.hostname || 'localhost';
        const port = parseInt(window.location.port, 10) || 3000;
        
        await this.network.connect(host, port);
        // Register with server and show browser
        this.network.register(playerName);
        this.ui.showScreen('browser-screen');
      } catch (error) {
        this.ui.showConnectionError('Failed to connect to server');
      }
    };

    // Session management
    this.ui.onCreateSession = (sessionName, hostName, settings) => {
      this.network.createSession(sessionName, hostName, settings);
    };

    this.ui.onJoinSession = (sessionId, playerName) => {
      this.network.joinSession(sessionId, playerName);
    };

    this.ui.onLeaveSession = () => {
      this.network.leaveSession();
    };

    this.ui.onRefreshSessions = () => {
      this.network.listSessions();
    };

    this.ui.onUpdateSessionSettings = (settings) => {
      this.network.updateSessionSettings(settings);
    };

    this.ui.onDeleteSession = () => {
      this.network.deleteSession();
    };

    this.ui.onSendBrowserChat = (message) => {
      this.network.sendBrowserChat(message);
    };

    // Game events
    // Game events
    this.ui.onStartGame = () => {
      this.network.startGame();
    };

    this.ui.onMakeBid = (quantity, faceValue) => {
      this.network.makeBid(quantity, faceValue);
    };

    this.ui.onCallDudo = () => {
      this.network.callDudo();
    };

    this.ui.onCallJonti = () => {
      this.network.callJonti();
    };

    this.ui.onPlayCard = (cardId, targetPlayerId, targetDieId, additionalData) => {
      this.network.playCard(cardId, targetPlayerId, targetDieId, additionalData);
    };

    this.ui.onReadyForRound = () => {
      this.network.readyForRound();
    };

    this.ui.onSendChat = (message) => {
      this.network.sendChat(message);
    };

    this.ui.onPauseGame = () => {
      this.network.pauseGame();
    };

    this.ui.onResumeGame = () => {
      this.network.resumeGame();
    };

    this.ui.onNewGame = () => {
      this.network.requestNewGame();
    };

    this.ui.onKickPlayer = (playerId) => {
      this.network.kickPlayer(playerId);
    };

    this.ui.onSelectSlot = (slot) => {
      this.network.selectSlot(slot);
    };
  }

  private updatePlayerIndexMap(): void {
    if (!this.gameState) return;
    
    this.playerIndexMap.clear();
    this.gameState.players.forEach((player, index) => {
      this.playerIndexMap.set(player.id, index);
    });
  }

  public dispose(): void {
    this.network.disconnect();
    this.renderer.dispose();
    this.music.dispose();
  }
}
