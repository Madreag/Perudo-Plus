// ============================================
// Perudo+ Game Client
// ============================================

import { NetworkClient } from './NetworkClient';
import { GameRenderer } from './GameRenderer';
import { UIManager } from './UIManager';
import { MusicManager } from './MusicManager';
import { PublicGameState, Die, Card, DudoResult, JontiResult } from '../shared/types';

export class GameClient {
  private network: NetworkClient;
  private renderer: GameRenderer;
  private ui: UIManager;
  private music: MusicManager;
  private gameState: PublicGameState | null = null;
  private playerIndexMap: Map<string, number> = new Map();
  private previousPhase: string | null = null;

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
        // Go back to lobby music when disconnected
        this.music.toLobby();
      }
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
    });

    this.network.on('onPlayerLeft', (playerId, playerName) => {
      this.ui.addSystemMessage(`${playerName} left the game`);
    });

    this.network.on('onBidMade', (playerId, bid) => {
      const playerName = this.gameState?.players.find(p => p.id === playerId)?.name || 'Unknown';
      this.ui.addSystemMessage(`${playerName} bid ${bid.quantity}× ${bid.faceValue}s`);
    });

    this.network.on('onDudoCalled', (callerId, callerName) => {
      this.ui.addSystemMessage(`${callerName} called DUDO!`);
    });

    this.network.on('onDudoResult', (result) => {
      this.ui.showDudoResult(result);
      
      // Reveal all dice in 3D
      this.renderer.revealAllDice(result.revealedDice, this.playerIndexMap);
    });

    this.network.on('onJontiCalled', (callerId, callerName) => {
      this.ui.addSystemMessage(`${callerName} called JONTI!`);
    });

    this.network.on('onJontiResult', (result) => {
      this.ui.showJontiResult(result);
      
      // Reveal all dice in 3D
      this.renderer.revealAllDice(result.revealedDice, this.playerIndexMap);
    });

    this.network.on('onRoundStarted', (roundNumber) => {
      this.ui.addSystemMessage(`Round ${roundNumber} started!`);
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
      this.ui.showPausedOverlay();
      // Music transition handled by onGameStateUpdate
    });

    this.network.on('onGameResumed', (resumedBy) => {
      this.ui.addSystemMessage(`Game resumed by ${resumedBy}`);
      this.ui.hidePausedOverlay();
      // Music transition handled by onGameStateUpdate
    });

    this.network.on('onError', (message, code) => {
      console.error(`Error [${code}]: ${message}`);
      this.ui.addSystemMessage(`Error: ${message}`);
    });
  }

  private setupUIEvents(): void {
    this.ui.onConnect = async (host, port, playerName) => {
      try {
        await this.network.connect(host, port);
        this.network.joinGame(playerName);
      } catch (error) {
        this.ui.showConnectionError('Failed to connect to server');
      }
    };

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
