// ============================================
// Perudo+ UI Manager
// ============================================

import { 
  PublicGameState, 
  PublicPlayerInfo, 
  Bid, 
  Die, 
  Card, 
  DudoResult,
  JontiResult,
  GamePhase,
  SessionInfo,
  GameSettings,
  GameMode,
  StageType
} from '../shared/types';

export class UIManager {
  private container: HTMLElement;
  private gameState: PublicGameState | null = null;
  private privateInfo: { dice: Die[]; cards: Card[] } | null = null;
  private playerId: string = '';
  private isHost: boolean = false;
  private pendingCard: Card | null = null;
  private pendingCardDraw: { playerId: string; playerName: string } | null = null;
  private selectedTargetPlayerId: string | null = null;
  private selectedTargetDieId: string | null = null;
  private selectedDieIds: string[] = [];
  private wasMyTurn: boolean = false;
  private keyboardBidDigits: string = ""; // Track typed digits for keyboard bid entry

  // Volume callback
  public onVolumeChange: ((volume: number) => void) | null = null;

  // Session callbacks
  public onConnect: ((playerName: string) => void) | null = null;
  public onCreateSession: ((sessionName: string, hostName: string, settings?: Partial<GameSettings>) => void) | null = null;
  public onJoinSession: ((sessionId: string, playerName: string) => void) | null = null;
  public onLeaveSession: (() => void) | null = null;
  public onRefreshSessions: (() => void) | null = null;
  public onUpdateSessionSettings: ((settings: { mode?: string; maxPlayers?: number; stage?: string }) => void) | null = null;
  public onDeleteSession: (() => void) | null = null;
  
  // Game callbacks
  public onStartGame: (() => void) | null = null;
  public onMakeBid: ((quantity: number, faceValue: number) => void) | null = null;
  public onCallDudo: (() => void) | null = null;
  public onCallJonti: (() => void) | null = null;
  public onPlayCard: ((cardId: string, targetPlayerId?: string, targetDieId?: string, additionalData?: any) => void) | null = null;
  public onReadyForRound: (() => void) | null = null;
  public onSendChat: ((message: string) => void) | null = null;
  public onNewGame: (() => void) | null = null;
  public onPauseGame: (() => void) | null = null;
  public onResumeGame: (() => void) | null = null;
  public onKickPlayer: ((playerId: string) => void) | null = null;
  public onSelectSlot: ((slot: number | null) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createUI();
  }

  private createUI(): void {
    this.container.innerHTML = `
      <div id="game-ui">
        <!-- Volume Control (visible on all screens) -->
        <div id="volume-control" class="volume-control">
          <span class="volume-icon">🔊</span>
          <input type="range" id="volume-slider" min="0" max="100" value="25" class="volume-slider">
        </div>

        <!-- Connection Screen -->
        <div id="connection-screen" class="screen active">
          <div class="panel connection-panel">
            <h1>🎲 Perudo+</h1>
            <p class="connection-subtitle">Enter your name to join</p>
            <div class="form-group">
              <label for="player-name">Your Name:</label>
              <input type="text" id="player-name" placeholder="Enter your name" maxlength="20" autofocus>
            </div>
            <div class="btn-with-help">
              <button id="connect-btn" class="btn primary">Join Game</button>
              <span class="help-icon">?<span class="tooltip">Connect to the server and browse available game sessions</span></span>
            </div>
            <p id="connection-error" class="error"></p>
          </div>
        </div>

        <!-- Server Browser Screen -->
        <div id="browser-screen" class="screen">
          <div class="browser-container">
            <div class="panel browser-panel">
              <div class="browser-header">
                <h2>🎮 Game Sessions</h2>
                <div class="browser-actions">
                  <div class="btn-with-help">
                    <button id="refresh-sessions-btn" class="btn secondary">🔄 Refresh</button>
                    <span class="help-icon">?<span class="tooltip">Refresh the list of available game sessions</span></span>
                  </div>
                  <div class="btn-with-help">
                    <button id="create-session-btn" class="btn primary">+ Create Session</button>
                    <span class="help-icon">?<span class="tooltip">Create a new game session that others can join. You'll be the host.</span></span>
                  </div>
                </div>
              </div>
              <div id="session-list" class="session-list">
                <div class="session-empty">Loading sessions...</div>
              </div>
              <div class="browser-footer">
                <span id="browser-player-name" class="browser-player-name"></span>
                <button id="browser-disconnect-btn" class="btn secondary">Disconnect</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Create Session Modal -->
        <div id="create-session-modal" class="modal" style="display: none;">
          <div class="modal-content create-session-content">
            <h3>Create New Session</h3>
            <div class="form-group">
              <label for="session-name">Session Name:</label>
              <input type="text" id="session-name" placeholder="My Game Room" maxlength="30">
            </div>
            <div class="form-group">
              <label for="session-mode">Game Mode:</label>
              <select id="session-mode">
                <option value="tactical">Tactical (Recommended)</option>
                <option value="classic">Classic</option>
                <option value="chaos">Chaos</option>
              </select>
            </div>
            <div class="form-group">
              <label for="session-max-players">Max Players:</label>
              <select id="session-max-players">
                <option value="2">2 Players</option>
                <option value="3">3 Players</option>
                <option value="4">4 Players</option>
                <option value="5">5 Players</option>
                <option value="6" selected>6 Players</option>
              </select>
            </div>
            <div class="form-group">
              <label for="session-stage">Stage:</label>
              <select id="session-stage">
                <option value="casino" selected>🎰 Casino</option>
                <option value="dungeon">🏰 Medieval Dungeon</option>
                <option value="beach">🏖️ Beach</option>
              </select>
            </div>
            <div class="modal-buttons">
              <button id="cancel-create-session" class="btn secondary">Cancel</button>
              <button id="confirm-create-session" class="btn primary">Create</button>
            </div>
          </div>
        </div>

        <!-- Lobby Screen -->
        <div id="lobby-screen" class="screen">
          <div class="lobby-container">
            <!-- Left Column: Player Slots + Chat -->
            <div class="lobby-left-column">
              <div class="panel lobby-slots-panel">
                <div class="lobby-header">
                  <div class="btn-with-help">
                    <button id="leave-session-btn" class="btn secondary">← Back</button>
                    <span class="help-icon">?<span class="tooltip">Leave this session and return to the server browser</span></span>
                  </div>
                  <h2>Player Slots</h2>
                </div>
                <div id="slot-list" class="slot-list"></div>
                <div class="lobby-actions">
                  <div class="btn-with-help">
                    <button id="start-game-btn" class="btn primary" style="display: none;">Start Game</button>
                    <span class="help-icon" id="start-game-help" style="display: none;">?<span class="tooltip">Start the game once all players are ready. Requires at least 2 players.</span></span>
                  </div>
                  <p class="waiting-text">Waiting for host to start...</p>
                </div>
              </div>
              <!-- Lobby Chat Panel (under player list) -->
              <div class="panel lobby-chat-panel">
                <div class="chat-header">
                  <span class="chat-title">Chat</span>
                </div>
                <div id="lobby-chat-messages" class="chat-messages"></div>
                <div class="chat-input-container">
                  <input type="text" id="lobby-chat-input" class="chat-input" placeholder="Type a message..." maxlength="200">
                  <button id="lobby-chat-send" class="chat-send-btn">Send</button>
                </div>
              </div>
            </div>
            
            <!-- Right Panel: Server Info, Host Settings & Unassigned Players -->
            <div class="lobby-right-panel">
              <div class="panel lobby-info-panel">
                <h3>Server Info</h3>
                <div id="server-info" class="server-info"></div>
              </div>
              <!-- Host Settings Panel (only visible to host) -->
              <div id="host-settings-panel" class="panel lobby-settings-panel" style="display: none;">
                <h3>⚙️ Session Settings</h3>
                <div class="settings-group">
                  <label for="settings-game-mode">Game Mode:</label>
                  <select id="settings-game-mode" class="settings-select">
                    <option value="classic">Classic</option>
                    <option value="tactical">Tactical</option>
                    <option value="chaos">Chaos</option>
                  </select>
                </div>
                <div class="settings-group">
                  <label for="settings-max-players">Max Players:</label>
                  <select id="settings-max-players" class="settings-select">
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </select>
                </div>
                <div class="settings-group">
                  <label for="settings-stage">Stage:</label>
                  <select id="settings-stage" class="settings-select">
                    <option value="casino">🎰 Casino</option>
                    <option value="dungeon">🏰 Medieval Dungeon</option>
                    <option value="beach">🏖️ Beach</option>
                  </select>
                </div>
                <div class="settings-actions">
                  <button id="delete-session-btn" class="btn danger">🗑️ Delete Session</button>
                </div>
              </div>
              <div class="panel lobby-unassigned-panel">
                <h3>Unassigned Players</h3>
                <div id="unassigned-list" class="unassigned-list"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Game Screen -->
        <div id="game-screen" class="screen">
          <!-- Top Bar -->
          <div id="top-bar" class="top-bar">
            <div id="round-info" class="round-info">Round 1</div>
            <div id="current-bid" class="current-bid">No bid yet</div>
            <div id="turn-indicator" class="turn-indicator"></div>
            <div class="top-bar-right">
              <div id="topbar-volume" class="topbar-volume">
                <span class="volume-icon-small">🔉</span>
                <input type="range" id="topbar-volume-slider" min="0" max="100" value="25" class="volume-slider-small">
              </div>
              <button id="pause-btn" class="btn pause-btn">⏸ Pause</button>
            </div>
          </div>

          <!-- Players Panel -->
          <div id="players-panel" class="players-panel"></div>



          <!-- Private Info Panel -->
          <div id="private-panel" class="private-panel">
            <div class="dice-section">
              <h3>Your Dice</h3>
              <div id="my-dice" class="dice-container"></div>
            </div>
            <div class="cards-section">
              <h3>Your Cards</h3>
              <div id="my-cards" class="cards-container"></div>
            </div>
          </div>

          <!-- Action Panel -->
          <div id="action-panel" class="action-panel">
            <div id="bid-controls" class="bid-controls">
              <div class="bid-inputs">
                <label>Quantity:</label>
                <input type="number" id="bid-quantity" min="1" value="1">
                <label>Face:</label>
                <select id="bid-face">
                  <option value="1">1 (Wild)</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5</option>
                  <option value="6">6</option>
                </select>
              </div>
              <div class="action-buttons">
                <div class="btn-with-help">
                  <button id="bid-btn" class="btn primary">Make Bid</button>
                  <span class="help-icon">?<span class="tooltip">Make a bid on how many dice of a certain face value are on the table. Must be higher than the previous bid.</span></span>
                </div>
                <div class="btn-with-help">
                  <button id="dudo-btn" class="btn danger">Call Dudo!</button>
                  <span class="help-icon">?<span class="tooltip">Challenge the previous bid! If correct, they lose a die. If wrong, you lose a die.</span></span>
                </div>
                <div class="btn-with-help">
                  <button id="jonti-btn" class="btn warning">Call Jonti!</button>
                  <span class="help-icon">?<span class="tooltip">Claim the bid is EXACTLY correct! High risk, high reward. Win: previous bidder loses a die. Lose: you lose a die.</span></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Chat Panel -->
          <div id="chat-panel" class="chat-panel">
            <div class="chat-header">
              <div class="chat-resize-handle" id="chat-resize-handle"></div>
              <span class="chat-title">Chat</span>
            </div>
            <div id="chat-messages" class="chat-messages"></div>
            <div class="chat-input-container">
              <input type="text" id="chat-input" placeholder="Type a message...">
              <button id="chat-send-btn" class="btn">Send</button>
            </div>
          </div>
        </div>

        <!-- Result Modal -->
        <div id="result-modal" class="modal">
          <div class="modal-content">
            <h2 id="result-title"></h2>
            <div id="result-details"></div>
            <div id="revealed-dice"></div>
            <button id="continue-btn" class="btn primary">Continue</button>
          </div>
        </div>

        <!-- Game Over Modal -->
        <div id="gameover-modal" class="modal">
          <div class="modal-content">
            <h2>🏆 Game Over!</h2>
            <p id="winner-text"></p>
            <button id="new-game-btn" class="btn primary">New Game</button>
          </div>
        </div>

        <!-- Card Targeting Modal -->
        <div id="card-target-modal" class="modal">
          <div class="modal-content">
            <h2 id="card-target-title">Select Target</h2>
            <p id="card-target-description"></p>
            <div id="card-target-options" class="target-options"></div>
            <button id="card-cancel-btn" class="btn">Cancel</button>
          </div>
        </div>

        <!-- Paused Overlay -->
        <div id="paused-modal" class="modal">
          <div class="modal-content paused-content">
            <h2>⏸ Game Paused</h2>
            <p id="paused-message">The game has been paused.</p>
            <button id="resume-btn" class="btn primary">▶ Resume Game</button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.injectStyles();
  }

  /**
   * Plays a calm soothing sound when it's the player's turn
   * Uses Web Audio API to generate a gentle chime
   */
  private playTurnSound(): void {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create a gentle, soothing chime sound
      const now = audioContext.currentTime;
      
      // First tone - soft bell-like sound
      const osc1 = audioContext.createOscillator();
      const gain1 = audioContext.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
      osc1.connect(gain1);
      gain1.connect(audioContext.destination);
      osc1.start(now);
      osc1.stop(now + 1.0);
      
      // Second tone - harmonious overtone
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.1); // E5
      gain2.gain.setValueAtTime(0, now + 0.1);
      gain2.gain.linearRampToValueAtTime(0.2, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 1.1);
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.start(now + 0.1);
      osc2.stop(now + 1.1);
      
      // Third tone - completing the chord
      const osc3 = audioContext.createOscillator();
      const gain3 = audioContext.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(783.99, now + 0.2); // G5
      gain3.gain.setValueAtTime(0, now + 0.2);
      gain3.gain.linearRampToValueAtTime(0.15, now + 0.25);
      gain3.gain.exponentialRampToValueAtTime(0.01, now + 1.2);
      osc3.connect(gain3);
      gain3.connect(audioContext.destination);
      osc3.start(now + 0.2);
      osc3.stop(now + 1.2);
    } catch (e) {
      // Audio not supported or blocked, silently ignore
      console.log('Could not play turn sound:', e);
    }
  }

  private attachEventListeners(): void {
    // Volume sliders (main and top-bar)
    const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
    const volumeIcon = document.querySelector('.volume-icon') as HTMLElement;
    const topbarVolumeSlider = document.getElementById('topbar-volume-slider') as HTMLInputElement;
    const topbarVolumeIcon = document.querySelector('.volume-icon-small') as HTMLElement;

    const updateVolumeUI = (volume: number) => {
      const iconText = volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
      if (volumeIcon) volumeIcon.textContent = iconText;
      if (topbarVolumeIcon) topbarVolumeIcon.textContent = iconText;
      if (volumeSlider) volumeSlider.value = String(Math.round(volume * 100));
      if (topbarVolumeSlider) topbarVolumeSlider.value = String(Math.round(volume * 100));
    };

    // Main volume slider
    volumeSlider?.addEventListener('input', () => {
      const volume = parseInt(volumeSlider.value, 10) / 100;
      this.onVolumeChange?.(volume);
      updateVolumeUI(volume);
    });

    // Top-bar volume slider
    topbarVolumeSlider?.addEventListener('input', () => {
      const volume = parseInt(topbarVolumeSlider.value, 10) / 100;
      this.onVolumeChange?.(volume);
      updateVolumeUI(volume);
    });

    // Click on volume icons to mute/unmute
    const handleVolumeIconClick = () => {
      const currentValue = parseInt(volumeSlider?.value || topbarVolumeSlider?.value || '25', 10);
      if (currentValue > 0) {
        if (volumeSlider) volumeSlider.dataset.previousVolume = String(currentValue);
        this.onVolumeChange?.(0);
        updateVolumeUI(0);
      } else {
        const prev = parseInt(volumeSlider?.dataset.previousVolume || '25', 10);
        const volume = prev / 100;
        this.onVolumeChange?.(volume);
        updateVolumeUI(volume);
      }
    };

    volumeIcon?.addEventListener('click', handleVolumeIconClick);
    topbarVolumeIcon?.addEventListener('click', handleVolumeIconClick);

    // Connection
    document.getElementById('connect-btn')?.addEventListener('click', () => {
      const name = (document.getElementById('player-name') as HTMLInputElement).value.trim();
      
      if (!name) {
        this.showConnectionError('Please enter your name');
        return;
      }
      
      this.onConnect?.(name);
    });

    // Start game
    document.getElementById('start-game-btn')?.addEventListener('click', () => {
      this.onStartGame?.();
    });

    // Make bid
    document.getElementById('bid-btn')?.addEventListener('click', () => {
      const quantity = parseInt((document.getElementById('bid-quantity') as HTMLInputElement).value, 10);
      const faceValue = parseInt((document.getElementById('bid-face') as HTMLSelectElement).value, 10);
      this.onMakeBid?.(quantity, faceValue);
    });

    // Call Dudo
    document.getElementById('dudo-btn')?.addEventListener('click', () => {
      this.onCallDudo?.();
    });

    // Call Jonti
    document.getElementById('jonti-btn')?.addEventListener('click', () => {
      this.onCallJonti?.();
    });

    // Continue after result
    document.getElementById('continue-btn')?.addEventListener('click', () => {
      this.hideModal('result-modal');
      
      // Play card draw animation after 0.25s delay if there's a pending card draw
      if (this.pendingCardDraw) {
        const cardDrawInfo = this.pendingCardDraw;
        this.pendingCardDraw = null;
        setTimeout(() => {
          this.playCardDrawAnimation(cardDrawInfo.playerId);
        }, 250);
      }
      
      this.onReadyForRound?.();
    });

    // New game button
    document.getElementById('new-game-btn')?.addEventListener('click', () => {
      this.hideModal('gameover-modal');
      this.onNewGame?.();
    });

    // Pause button
    document.getElementById('pause-btn')?.addEventListener('click', () => {
      this.onPauseGame?.();
    });

    // Resume button
    document.getElementById('resume-btn')?.addEventListener('click', () => {
      this.onResumeGame?.();
    });

    // Card targeting cancel button
    document.getElementById('card-cancel-btn')?.addEventListener('click', () => {
      this.hideModal('card-target-modal');
      this.pendingCard = null;
    });

    // Chat
    document.getElementById('chat-send-btn')?.addEventListener('click', () => {
      const input = document.getElementById('chat-input') as HTMLInputElement;
      const message = input.value.trim();
      if (message) {
        this.onSendChat?.(message);
        input.value = '';
      }
    });

    document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('chat-send-btn')?.click();
      }
    });

    // Lobby Chat
    document.getElementById('lobby-chat-send')?.addEventListener('click', () => {
      const input = document.getElementById('lobby-chat-input') as HTMLInputElement;
      const message = input.value.trim();
      if (message) {
        this.onSendChat?.(message);
        input.value = '';
      }
    });

    document.getElementById('lobby-chat-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('lobby-chat-send')?.click();
      }
    });

    // Enter key for connection
    document.getElementById('player-name')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('connect-btn')?.click();
      }
    });

    // Server Browser - Refresh sessions
    document.getElementById('refresh-sessions-btn')?.addEventListener('click', () => {
      this.onRefreshSessions?.();
    });

    // Server Browser - Create session button
    document.getElementById('create-session-btn')?.addEventListener('click', () => {
      this.showModal('create-session-modal');
      // Set default session name
      const nameInput = document.getElementById('session-name') as HTMLInputElement;
      const playerName = (document.getElementById('player-name') as HTMLInputElement)?.value || 'Player';
      if (nameInput) {
        nameInput.value = `${playerName}'s Game`;
      }
    });

    // Server Browser - Disconnect
    document.getElementById('browser-disconnect-btn')?.addEventListener('click', () => {
      this.showScreen('connection-screen');
    });

    // Create Session Modal - Cancel
    document.getElementById('cancel-create-session')?.addEventListener('click', () => {
      this.hideModal('create-session-modal');
    });

    // Create Session Modal - Confirm
    document.getElementById('confirm-create-session')?.addEventListener('click', () => {
      const sessionName = (document.getElementById('session-name') as HTMLInputElement).value.trim();
      const mode = (document.getElementById('session-mode') as HTMLSelectElement).value as GameMode;
      const maxPlayers = parseInt((document.getElementById('session-max-players') as HTMLSelectElement).value, 10);
      const stage = (document.getElementById('session-stage') as HTMLSelectElement).value as StageType;
      const playerName = (document.getElementById('player-name') as HTMLInputElement)?.value.trim() || 'Host';

      if (!sessionName) {
        alert('Please enter a session name');
        return;
      }

      this.hideModal('create-session-modal');
      this.onCreateSession?.(sessionName, playerName, { mode, maxPlayers, stage });
    });

    // Leave Session (back to browser)
    document.getElementById('leave-session-btn')?.addEventListener('click', () => {
      this.onLeaveSession?.();
    });

    // Host Settings - Game Mode
    document.getElementById('settings-game-mode')?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value;
      this.onUpdateSessionSettings?.({ mode });
    });

    // Host Settings - Max Players
    document.getElementById('settings-max-players')?.addEventListener('change', (e) => {
      const maxPlayers = parseInt((e.target as HTMLSelectElement).value, 10);
      this.onUpdateSessionSettings?.({ maxPlayers });
    });

    // Host Settings - Stage
    document.getElementById('settings-stage')?.addEventListener('change', (e) => {
      const stage = (e.target as HTMLSelectElement).value;
      this.onUpdateSessionSettings?.({ stage });
    });

    // Host Settings - Delete Session
    document.getElementById('delete-session-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete this session? All players will be returned to the server browser.')) {
        this.onDeleteSession?.();
      }
    });

    // Chat panel resize functionality
    this.setupChatResize();
    this.setupKeyboardBidInput();
  }

  private setupChatResize(): void {
    const chatPanel = document.getElementById('chat-panel');
    const resizeHandle = document.getElementById('chat-resize-handle');

    if (!chatPanel || !resizeHandle) return;

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    // Function to update other panels based on chat panel size
    const updatePanelPositions = (chatWidth: number, chatHeight: number) => {
      const privatePanel = document.getElementById('private-panel');
      const actionPanel = document.getElementById('action-panel');

      // Calculate the right offset for private and action panels
      // Chat panel is at right: 10px, so other panels need right: chatWidth + 20px (10px gap)
      const rightOffset = chatWidth + 20;

      if (privatePanel) {
        privatePanel.style.right = `${rightOffset}px`;
      }

      if (actionPanel) {
        actionPanel.style.right = `${rightOffset}px`;
      }

    };


    const onMouseDown = (e: MouseEvent) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = chatPanel.offsetWidth;
      startHeight = chatPanel.offsetHeight;

      document.body.style.cursor = 'nw-resize';
      document.body.style.userSelect = 'none';

      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      // Calculate the difference (inverted because we're resizing from top-left)
      const deltaX = startX - e.clientX;
      const deltaY = startY - e.clientY;

      // Calculate new dimensions
      const newWidth = Math.min(Math.max(startWidth + deltaX, 200), 600);
      const newHeight = Math.min(Math.max(startHeight + deltaY, 150), window.innerHeight * 0.8);

      chatPanel.style.width = `${newWidth}px`;
      chatPanel.style.height = `${newHeight}px`;

      // Update other panels to avoid overlap
      updatePanelPositions(newWidth, newHeight);
    };

    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    resizeHandle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private setupKeyboardBidInput(): void {
    // Handle keyboard input for bid entry
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      // Don't capture keyboard input if user is typing in an input field or textarea
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT'
      )) {
        return;
      }

      // Only process keyboard bids during bidding phase and when it's the player's turn
      if (!this.gameState || this.gameState.phase !== 'bidding') {
        return;
      }

      const currentPlayer = this.gameState.players[this.gameState.currentTurnIndex];
      const isMyTurn = currentPlayer?.id === this.playerId;
      if (!isMyTurn) {
        return;
      }

      // Handle number keys (0-9)
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        
        // If we already have 2 digits, start over
        if (this.keyboardBidDigits.length >= 2) {
          this.keyboardBidDigits = '';
        }
        
        this.keyboardBidDigits += e.key;
        
        // Update the UI based on typed digits
        this.updateBidInputsFromKeyboard();
      }
      
      // Handle Enter key to submit bid
      if (e.key === 'Enter') {
        e.preventDefault();
        
        // Only submit if we have valid bid values
        const quantityInput = document.getElementById('bid-quantity') as HTMLInputElement;
        const faceInput = document.getElementById('bid-face') as HTMLSelectElement;
        
        if (quantityInput && faceInput) {
          const quantity = parseInt(quantityInput.value, 10);
          const faceValue = parseInt(faceInput.value, 10);
          
          if (quantity > 0 && faceValue >= 1 && faceValue <= 6) {
            this.onMakeBid?.(quantity, faceValue);
            this.keyboardBidDigits = ''; // Reset after submission
          }
        }
      }
      
      // Handle Backspace to clear keyboard input
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (this.keyboardBidDigits.length > 0) {
          this.keyboardBidDigits = this.keyboardBidDigits.slice(0, -1);
          this.updateBidInputsFromKeyboard();
        }
      }
      
      // Handle Escape to clear keyboard input
      if (e.key === 'Escape') {
        e.preventDefault();
        this.keyboardBidDigits = '';
        // Don't update inputs on escape, just clear the buffer
      }
    });
  }

  private updateBidInputsFromKeyboard(): void {
    const quantityInput = document.getElementById('bid-quantity') as HTMLInputElement;
    const faceInput = document.getElementById('bid-face') as HTMLSelectElement;
    
    if (!quantityInput || !faceInput) return;
    
    if (this.keyboardBidDigits.length >= 1) {
      // First digit is quantity
      const quantity = parseInt(this.keyboardBidDigits[0], 10);
      // Quantity must be at least 1
      quantityInput.value = quantity === 0 ? '10' : quantity.toString();
    }
    
    if (this.keyboardBidDigits.length >= 2) {
      // Second digit is face value (1-6)
      let faceValue = parseInt(this.keyboardBidDigits[1], 10);
      // Clamp face value to 1-6, treat 0 as 6, and 7-9 as 1-3 (wrap around)
      if (faceValue === 0) {
        faceValue = 6;
      } else if (faceValue > 6) {
        faceValue = faceValue - 6; // 7->1, 8->2, 9->3
      }
      faceInput.value = faceValue.toString();
    }
    
    // Add visual feedback to show keyboard input is active
    this.showKeyboardBidFeedback();
  }

  private showKeyboardBidFeedback(): void {
    const bidControls = document.getElementById('bid-controls');
    if (!bidControls) return;
    
    // Add a brief highlight effect
    bidControls.classList.add('keyboard-input-active');
    
    // Remove the class after a short delay
    setTimeout(() => {
      bidControls.classList.remove('keyboard-input-active');
    }, 200);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #game-ui {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #fff;
        pointer-events: none;
      }

      /* Enable pointer events only on interactive elements, not on container divs */
      #game-ui .panel,
      #game-ui .volume-control,
      #game-ui .top-bar,
      #game-ui .bottom-panel,
      #game-ui .side-panel,
      #game-ui .chat-panel,
      #game-ui .modal,
      #game-ui button,
      #game-ui input,
      #game-ui select,
      #game-ui .btn,
      #game-ui .help-icon,
      #game-ui .session-item,
      #game-ui .player-slot,
      #game-ui .card,
      #game-ui .die-option,
      #game-ui .bid-controls,
      #game-ui .action-buttons,
      #game-ui .chat-input-container,
      #game-ui .player-info-panel,
      #game-ui .browser-container,
      #game-ui .lobby-container,
      #game-ui .dice-container,
      #game-ui .cards-container,
      #game-ui .result-content,
      #game-ui .dice-display,
      #game-ui .player-card {
        pointer-events: auto;
      }
      
      /* Screens themselves should not capture events */
      #game-ui .screen {
        pointer-events: none;
      }

      /* Volume Control - hidden on game screen since top bar has its own */
      .volume-control {
        position: fixed;
        top: 16px;
        right: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(30, 30, 50, 0.9);
        padding: 8px 12px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 1001;
      }


      /* Help Tooltips */
      .help-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        font-size: 11px;
        font-weight: bold;
        color: rgba(255, 255, 255, 0.6);
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        cursor: help;
        margin-left: 6px;
        position: relative;
        user-select: none;
        transition: all 0.2s;
      }

      .help-icon:hover {
        color: #fff;
        background: rgba(78, 205, 196, 0.3);
        border-color: #4ecdc4;
      }

      .help-icon .tooltip {
        visibility: hidden;
        opacity: 0;
        position: absolute;
        bottom: calc(100% + 8px);
        left: 50%;
        transform: translateX(-50%);
        background: rgba(20, 20, 40, 0.98);
        color: #fff;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: normal;
        line-height: 1.4;
        width: 220px;
        text-align: center;
        border: 1px solid rgba(78, 205, 196, 0.5);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        z-index: 1002;
        transition: opacity 0.2s, visibility 0.2s;
      }

      .help-icon .tooltip::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 6px solid transparent;
        border-top-color: rgba(20, 20, 40, 0.98);
      }

      .help-icon:hover .tooltip {
        visibility: visible;
        opacity: 1;
      }

      .btn-with-help {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .volume-icon {
        font-size: 1.2em;
        cursor: pointer;
        user-select: none;
      }

      .volume-slider {
        width: 80px;
        height: 6px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
        outline: none;
        cursor: pointer;
      }

      .volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 14px;
        height: 14px;
        background: #4ecdc4;
        border-radius: 50%;
        cursor: pointer;
        transition: transform 0.1s ease;
      }

      .volume-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
      }

      .volume-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        background: #4ecdc4;
        border-radius: 50%;
        cursor: pointer;
        border: none;
      }

      .screen {
        display: none;
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
      }

      .screen.active {
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .panel {
        background: rgba(30, 30, 50, 0.95);
        border-radius: 16px;
        padding: 32px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .connection-panel {
        width: 350px;
        text-align: center;
      }

      .connection-panel h1 {
        margin-bottom: 8px;
        font-size: 2.5em;
      }

      .connection-subtitle {
        color: rgba(255, 255, 255, 0.7);
        margin-bottom: 24px;
        font-size: 1.1em;
      }

      .form-group {
        margin-bottom: 16px;
        text-align: left;
      }

      .form-group label {
        display: block;
        margin-bottom: 4px;
        color: #aaa;
      }

      .form-group input {
        width: 100%;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.3);
        color: #fff;
        font-size: 16px;
        box-sizing: border-box;
      }

      .btn {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: bold;
      }

      .btn.primary {
        background: linear-gradient(135deg, #4a90d9, #357abd);
        color: white;
      }

      .btn.primary:hover {
        background: linear-gradient(135deg, #5a9fe9, #4589cc);
        transform: translateY(-2px);
      }

      .btn.danger {
        background: linear-gradient(135deg, #e74c3c, #c0392b);
        color: white;
      }

      .btn.danger:hover {
        background: linear-gradient(135deg, #f75c4c, #d0493b);
      }

      .btn.warning {
        background: linear-gradient(135deg, #f39c12, #d68910);
        color: white;
      }

      .btn.warning:hover {
        background: linear-gradient(135deg, #f5ab35, #e69a20);
      }

      .error {
        color: #e74c3c;
        margin-top: 12px;
      }

      /* Server Browser Styles */
      .browser-container {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        height: 100vh;
        padding: 20px;
      }

      .browser-panel {
        width: 100%;
        max-width: 900px;
        height: 80vh;
        display: flex;
        flex-direction: column;
      }

      .browser-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        flex-wrap: wrap;
        gap: 12px;
      }

      .browser-header h2 {
        margin: 0;
      }

      .browser-actions {
        display: flex;
        gap: 12px;
      }

      .session-list {
        flex: 1;
        overflow-y: auto;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 8px;
        padding: 12px;
      }

      .session-empty {
        text-align: center;
        color: rgba(255, 255, 255, 0.5);
        padding: 40px;
        font-style: italic;
      }

      .session-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 12px;
        transition: all 0.2s ease;
      }

      .session-item:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(78, 205, 196, 0.5);
      }

      .session-item.previous-session {
        border-color: #f39c12;
        background: rgba(243, 156, 18, 0.1);
      }

      .session-item.previous-session::before {
        content: '⚠️ Rejoin: ';
        color: #f39c12;
        font-weight: bold;
      }

      .session-info {
        flex: 1;
      }

      .session-name {
        font-size: 1.2em;
        font-weight: bold;
        color: #4ecdc4;
        margin-bottom: 4px;
      }

      .session-details {
        font-size: 0.9em;
        color: rgba(255, 255, 255, 0.7);
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
      }

      .session-host {
        color: #ffe66d;
      }

      .session-players {
        color: #2ecc71;
      }

      .session-mode {
        color: #9b59b6;
        text-transform: capitalize;
      }

      .session-phase {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.85em;
      }

      .session-phase.lobby {
        background: rgba(46, 204, 113, 0.2);
        color: #2ecc71;
      }

      .session-phase.playing {
        background: rgba(241, 196, 15, 0.2);
        color: #f1c40f;
      }

      .session-phase.paused {
        background: rgba(155, 89, 182, 0.2);
        color: #9b59b6;
      }

      .session-join-btn {
        padding: 10px 24px;
      }

      .browser-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .browser-player-name {
        color: #4ecdc4;
        font-weight: bold;
      }

      .create-session-content {
        max-width: 400px;
      }

      .create-session-content h3 {
        margin-bottom: 20px;
        text-align: center;
      }

      /* WC3-Style Lobby Layout */
      .lobby-container {
        display: flex;
        gap: 20px;
        width: 100%;
        max-width: 1000px;
        height: 85vh;
        padding: 20px;
      }

      .lobby-left-column {
        flex: 2;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .lobby-slots-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }

      .lobby-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .lobby-header h2 {
        flex: 1;
        text-align: center;
        margin: 0;
        margin-right: 80px; /* Balance for back button width */
      }

      .lobby-slots-panel h2 {
        margin-bottom: 16px;
        text-align: center;
      }

      .lobby-right-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 280px;
        max-width: 300px;
      }

      .lobby-info-panel {
        padding: 12px;
      }

      .lobby-info-panel h3 {
        margin-bottom: 8px;
      }

      .lobby-unassigned-panel {
        padding: 12px;
        flex-shrink: 0;
      }

      .lobby-unassigned-panel h3 {
        margin-bottom: 8px;
      }

      .lobby-settings-panel {
        padding: 12px;
      }

      .lobby-settings-panel h3 {
        margin-bottom: 12px;
      }

      .settings-group {
        margin-bottom: 12px;
      }

      .settings-group label {
        display: block;
        margin-bottom: 4px;
        color: #aaa;
        font-size: 0.9em;
      }

      .settings-select {
        width: 100%;
        padding: 8px 12px;
        background: #2a2a4a;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        color: #fff;
        font-size: 1em;
        cursor: pointer;
      }

      .settings-select option {
        background: #2a2a4a;
        color: #fff;
        padding: 8px;
      }

      .settings-select:hover {
        border-color: rgba(255, 255, 255, 0.4);
      }

      .settings-select:focus {
        outline: none;
        border-color: #4ecdc4;
      }

      .settings-actions {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .settings-actions .btn {
        width: 100%;
      }

      .server-info {
        background: rgba(0, 0, 0, 0.3);
        padding: 12px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 0.9em;
      }

      /* Slot List */
      .slot-list {
        flex: 1;
        overflow-y: auto;
      }

      .slot-row {
        display: flex;
        align-items: center;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        margin-bottom: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .slot-row.occupied {
        background: rgba(46, 204, 113, 0.15);
        border-color: rgba(46, 204, 113, 0.3);
      }

      .slot-row.empty {
        background: rgba(255, 255, 255, 0.02);
      }

      .slot-number {
        font-weight: bold;
        width: 60px;
        color: #888;
      }

      .slot-content {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .slot-player-name {
        font-weight: bold;
        color: #2ecc71;
      }

      .slot-player-name.host::after {
        content: ' 👑';
      }

      .slot-player-ip {
        font-size: 0.85em;
        color: #888;
        font-family: monospace;
      }

      .slot-empty-text {
        color: #666;
        font-style: italic;
      }

      .slot-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .slot-select {
        padding: 4px 8px;
        background: rgba(52, 152, 219, 0.3);
        border: 1px solid rgba(52, 152, 219, 0.5);
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 0.85em;
      }

      .slot-select:hover {
        background: rgba(52, 152, 219, 0.5);
      }

      .slot-select:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Unassigned Players List */
      .unassigned-list {
        max-height: 300px;
        overflow-y: auto;
      }

      .unassigned-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: rgba(231, 76, 60, 0.15);
        border-radius: 4px;
        margin-bottom: 4px;
        border: 1px solid rgba(231, 76, 60, 0.3);
      }

      .unassigned-name {
        color: #e74c3c;
      }

      .unassigned-ip {
        font-size: 0.8em;
        color: #888;
        font-family: monospace;
      }

      .kick-btn {
        padding: 4px 8px;
        background: #c0392b;
        border: none;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        font-size: 0.8em;
      }

      .kick-btn:hover {
        background: #e74c3c;
      }

      .lobby-actions {
        margin-top: 16px;
        text-align: center;
      }

      .waiting-text {
        color: #aaa;
        font-style: italic;
      }

      .lobby-chat-panel {
        height: 450px;
        flex-shrink: 0;
        background: rgba(30, 30, 50, 0.9);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      /* Game Screen */
      #game-screen {
        display: none;
      }

      #game-screen.active {
        display: block;
      }

      .top-bar {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 60px;
        background: rgba(30, 30, 50, 0.9);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        z-index: 1001;
      }

      .round-info {
        font-size: 1.2em;
        font-weight: bold;
      }

      .current-bid {
        font-size: 1.4em;
        color: #4ecdc4;
      }

      .turn-indicator {
        font-size: 1.1em;
        color: #ffe66d;
      }

      .top-bar-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .topbar-volume {
        display: flex;
        align-items: center;
        gap: 6px;
        position: relative;
        z-index: 1001;
      }

      .volume-icon-small {
        font-size: 1em;
        cursor: pointer;
        user-select: none;
      }

      .volume-slider-small {
        width: 60px;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: rgba(255, 255, 255, 0.3);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }

      .volume-slider-small::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        background: #4ecdc4;
        border-radius: 50%;
        cursor: pointer;
      }

      .volume-slider-small::-moz-range-thumb {
        width: 12px;
        height: 12px;
        background: #4ecdc4;
        border-radius: 50%;
        cursor: pointer;
        border: none;
      }

      .pause-btn {
        padding: 8px 16px;
        font-size: 0.9em;
        background: linear-gradient(135deg, #6c5ce7, #5b4cdb);
        border: none;
        border-radius: 6px;
        color: white;
        cursor: pointer;
        transition: all 0.2s;
      }

      .pause-btn:hover:not(:disabled) {
        background: linear-gradient(135deg, #7c6cf7, #6b5ceb);
        transform: translateY(-1px);
      }

      .pause-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .paused-content {
        text-align: center;
      }

      .paused-content h2 {
        font-size: 2em;
        margin-bottom: 16px;
      }

      .paused-content p {
        margin-bottom: 24px;
        color: #aaa;
      }

      .players-panel {
        transition: max-height 0.1s ease-out, right 0.1s ease-out, width 0.1s ease-out;
        overflow-y: auto;
        position: absolute;
        top: 70px;
        right: 10px;
        width: 300px;
        background: rgba(30, 30, 50, 0.8);
        border-radius: 12px;
        padding: 16px;
      }

      .player-status {
        padding: 8px;
        margin-bottom: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
      }

      .player-status.current-turn {
        border: 2px solid #ffe66d;
      }

      .player-status.eliminated {
        opacity: 0.5;
      }

      .player-name {
        font-weight: bold;
        margin-bottom: 4px;
      }

      .player-stats {
        font-size: 0.9em;
        color: #aaa;
      }



      /* Card draw animation */
      .card-drawing {
        position: fixed;
        width: 70px;
        height: 100px;
        background: linear-gradient(135deg, #4ecdc4 0%, #2a8a85 50%, #4ecdc4 100%);
        border: 2px solid #6eeee6;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(78, 205, 196, 0.6);
        z-index: 10000;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }

      .card-drawing-label {
        position: absolute;
        top: -28px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: bold;
        white-space: nowrap;
        border: 1px solid rgba(255, 255, 255, 0.3);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }

      .card-drawing-to-self .card-drawing-label {
        background: rgba(78, 205, 196, 0.9);
        color: #fff;
        border-color: #6eeee6;
        animation: labelPulse 0.3s ease-in-out infinite alternate;
      }

      .card-drawing-icon {
        font-size: 32px;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
      }

      /* Animation for cards going to other players */
      .card-drawing-to-other {
        animation: cardDrawToOther 0.9s ease-out forwards;
      }

      /* Animation for cards going to current player - more satisfying snap */
      .card-drawing-to-self {
        animation: cardDrawToSelf 1s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes labelPulse {
        from { transform: translateX(-50%) scale(1); }
        to { transform: translateX(-50%) scale(1.05); }
      }

      @keyframes cardDrawToOther {
        0% {
          opacity: 1;
          transform: scale(1) rotateY(0deg) translate(0, 0);
        }
        20% {
          opacity: 1;
          transform: scale(1.15) rotateY(0deg) translate(0, -30px);
        }
        50% {
          opacity: 1;
          transform: scale(1.1) rotateY(90deg) translate(calc(var(--target-x) * 0.5), calc(var(--target-y) * 0.5 - 40px));
        }
        80% {
          opacity: 1;
          transform: scale(1) rotateY(180deg) translate(var(--target-x), var(--target-y));
        }
        100% {
          opacity: 0;
          transform: scale(0.8) rotateY(180deg) translate(var(--target-x), var(--target-y));
        }
      }

      @keyframes cardDrawToSelf {
        0% {
          opacity: 1;
          transform: scale(1) rotateY(0deg) translate(0, 0);
          box-shadow: 0 4px 20px rgba(78, 205, 196, 0.6);
        }
        15% {
          opacity: 1;
          transform: scale(1.2) rotateY(0deg) translate(0, -40px);
          box-shadow: 0 8px 30px rgba(78, 205, 196, 0.8);
        }
        40% {
          opacity: 1;
          transform: scale(1.1) rotateY(180deg) translate(calc(var(--target-x) * 0.4), calc(var(--target-y) * 0.4 - 50px));
          box-shadow: 0 12px 40px rgba(78, 205, 196, 1);
        }
        70% {
          opacity: 1;
          transform: scale(1.05) rotateY(360deg) translate(calc(var(--target-x) * 0.85), calc(var(--target-y) * 0.85));
          box-shadow: 0 8px 30px rgba(78, 205, 196, 0.9);
        }
        85% {
          opacity: 1;
          transform: scale(1.15) rotateY(360deg) translate(var(--target-x), var(--target-y));
          box-shadow: 0 0 50px rgba(78, 205, 196, 1), 0 0 80px rgba(78, 205, 196, 0.6);
        }
        100% {
          opacity: 0;
          transform: scale(0.3) rotateY(360deg) translate(var(--target-x), var(--target-y));
          box-shadow: 0 0 60px rgba(78, 205, 196, 0.8);
        }
      }

      /* Highlight effect on the cards container when receiving a card */
      .card-receiving {
        animation: cardReceiveHighlight 1.2s ease-out;
      }

      @keyframes cardReceiveHighlight {
        0% {
          box-shadow: inset 0 0 0 rgba(78, 205, 196, 0);
        }
        50% {
          box-shadow: inset 0 0 30px rgba(78, 205, 196, 0.6), 0 0 20px rgba(78, 205, 196, 0.4);
        }
        100% {
          box-shadow: inset 0 0 0 rgba(78, 205, 196, 0);
        }
      }

      .private-panel {
        transition: right 0.1s ease-out;
        position: absolute;
        bottom: 80px;
        left: 10px;
        right: 620px;
        background: rgba(30, 30, 50, 0.9);
        border-radius: 12px;
        padding: 16px;
        display: flex;
        gap: 24px;
      }

      .dice-section, .cards-section {
        flex: 1;
      }

      .dice-section h3, .cards-section h3 {
        margin-bottom: 12px;
        color: #aaa;
      }

      .dice-container {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .die-display {
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        font-size: 1.5em;
        font-weight: bold;
        position: relative;
      }

      .die-display .die-type {
        position: absolute;
        bottom: -16px;
        font-size: 0.5em;
        color: #aaa;
      }

      .die-d3 { background: #ff6b6b; }
      .die-d4 { background: #4ecdc4; }
      .die-d6 { background: #ffe66d; color: #333; }
      .die-d8 { background: #95e1d3; color: #333; }
      .die-d10 { background: #dda0dd; }

      .cards-container {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .card-display {
        width: 100px;
        padding: 12px;
        background: linear-gradient(135deg, #2c3e50, #34495e);
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.2s;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .card-display:hover {
        transform: translateY(-4px);
        border-color: #4a90d9;
      }

      .card-name {
        font-weight: bold;
        font-size: 0.9em;
        margin-bottom: 4px;
      }

      .card-desc {
        font-size: 0.7em;
        color: #aaa;
      }

      .action-panel {
        transition: right 0.1s ease-out;
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 620px;
        background: rgba(30, 30, 50, 0.9);
        border-radius: 12px;
        padding: 16px;
      }

      .bid-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .bid-controls.keyboard-input-active {
        box-shadow: 0 0 10px rgba(100, 200, 255, 0.5);
        border-color: rgba(100, 200, 255, 0.5);
      }

      .bid-controls.keyboard-input-active .bid-inputs input,
      .bid-controls.keyboard-input-active .bid-inputs select {
        border-color: rgba(100, 200, 255, 0.7);
        background: rgba(100, 200, 255, 0.1);
      }

      .bid-inputs {
        display: flex;
        gap: 12px;
        align-items: center;
      }

      .bid-inputs input, .bid-inputs select {
        padding: 8px 12px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.3);
        color: #fff;
        font-size: 16px;
        width: 80px;
      }

      .action-buttons {
        display: flex;
        gap: 12px;
      }

      .chat-panel {
        position: absolute;
        bottom: 10px;
        right: 10px;
        width: 600px;
        height: 350px;
        min-width: 200px;
        min-height: 150px;
        max-width: 1600px;
        max-height: 80vh;
        background: rgba(30, 30, 50, 0.9);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        resize: both;
      }

      .chat-header {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.3);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        cursor: default;
        flex-shrink: 0;
      }

      .chat-title {
        font-size: 0.9em;
        font-weight: bold;
        color: #4a90d9;
      }

      .chat-resize-handle {
        width: 16px;
        height: 16px;
        cursor: nw-resize;
        margin-right: 8px;
        position: relative;
        opacity: 0.6;
        transition: opacity 0.2s;
      }

      .chat-resize-handle:hover {
        opacity: 1;
      }

      .chat-resize-handle::before,
      .chat-resize-handle::after {
        content: '';
        position: absolute;
        background: #4a90d9;
      }

      .chat-resize-handle::before {
        width: 10px;
        height: 2px;
        top: 7px;
        left: 0;
      }

      .chat-resize-handle::after {
        width: 2px;
        height: 10px;
        top: 0;
        left: 7px;
      }

      .chat-messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 12px;
      }

      .chat-message {
        margin-bottom: 8px;
        font-size: 0.9em;
      }

      .chat-message .sender {
        font-weight: bold;
        color: #4a90d9;
      }

      .chat-input-container {
        flex-shrink: 0;
        display: flex;
        padding: 8px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .chat-input-container input {
        flex: 1;
        min-width: 0;
        padding: 8px;
        border: none;
        border-radius: 4px 0 0 4px;
        background: rgba(0, 0, 0, 0.3);
        color: #fff;
      }

      .chat-input-container button {
        flex-shrink: 0;
        border-radius: 0 4px 4px 0;
        padding: 8px 12px;
      }

      /* Modals */
      .modal {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        justify-content: center;
        align-items: center;
        z-index: 1000;
      }

      .modal.active {
        display: flex;
      }

      .modal-content {
        background: rgba(30, 30, 50, 0.98);
        padding: 32px;
        border-radius: 16px;
        text-align: center;
        max-width: 500px;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .modal-content h2 {
        margin-bottom: 16px;
      }

      #revealed-dice {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        margin: 16px 0;
      }

      .revealed-player {
        background: rgba(255, 255, 255, 0.1);
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 8px;
      }

      .revealed-player-name {
        font-weight: bold;
        margin-bottom: 8px;
      }

      .revealed-dice-row {
        display: flex;
        gap: 4px;
        justify-content: center;
      }

      .mini-die {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        font-weight: bold;
      }

      /* Card Targeting UI Styles */
      .target-options {
        max-height: 400px;
        overflow-y: auto;
        margin: 16px 0;
      }

      .target-section {
        margin-bottom: 16px;
      }

      .target-option {
        background: rgba(255, 255, 255, 0.1);
        border: 2px solid transparent;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .target-option:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(74, 144, 217, 0.5);
      }

      .target-option.selected {
        background: rgba(74, 144, 217, 0.3);
        border-color: #4a90d9;
      }

      .target-player {
        font-weight: bold;
        margin-bottom: 8px;
        color: #4ecdc4;
      }

      .target-dice {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .target-die {
        width: 45px;
        height: 45px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        font-size: 1.2em;
        font-weight: bold;
        background: rgba(255, 255, 255, 0.2);
        border: 2px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
      }

      .target-die:hover {
        background: rgba(255, 255, 255, 0.3);
        border-color: rgba(74, 144, 217, 0.5);
        transform: scale(1.05);
      }

      .target-die.selected {
        background: rgba(74, 144, 217, 0.4);
        border-color: #4a90d9;
        box-shadow: 0 0 10px rgba(74, 144, 217, 0.5);
      }

      .face-value-options {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
        margin: 16px 0;
      }

      .face-value-btn {
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        font-size: 1.5em;
        font-weight: bold;
        background: rgba(255, 255, 255, 0.2);
        border: 2px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
        color: white;
      }

      .face-value-btn:hover {
        background: rgba(255, 255, 255, 0.3);
        border-color: rgba(74, 144, 217, 0.5);
        transform: scale(1.1);
      }

      .face-value-btn.selected {
        background: rgba(74, 144, 217, 0.4);
        border-color: #4a90d9;
        box-shadow: 0 0 10px rgba(74, 144, 217, 0.5);
      }

      #selection-count {
        text-align: center;
        margin: 12px 0;
        color: #aaa;
        font-size: 0.9em;
      }

      #card-cancel-btn {
        margin-top: 12px;
        background: rgba(255, 255, 255, 0.1);
        color: #aaa;
      }

      #card-cancel-btn:hover {
        background: rgba(255, 255, 255, 0.2);
        color: white;
      }

      /* Card display improvements */
      .card-display {
        position: relative;
        width: 120px;
        min-height: 100px;
        padding: 12px;
        background: linear-gradient(135deg, #2c3e50, #34495e);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        border: 2px solid rgba(255, 255, 255, 0.2);
      }

      .card-display:hover {
        transform: translateY(-4px);
        border-color: #4a90d9;
        box-shadow: 0 4px 15px rgba(74, 144, 217, 0.3);
      }

      .card-display.disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .card-display.disabled:hover {
        transform: none;
        border-color: rgba(255, 255, 255, 0.2);
        box-shadow: none;
      }

      .card-timing {
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 0.6em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.3);
        color: #aaa;
      }

      .card-timing.can-play {
        background: rgba(46, 204, 113, 0.3);
        color: #2ecc71;
      }

      /* Card played notification */
      .card-notification {
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(30, 30, 50, 0.95);
        border: 2px solid #4a90d9;
        border-radius: 12px;
        padding: 16px 24px;
        z-index: 1001;
        animation: cardNotificationSlide 0.3s ease-out;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }

      @keyframes cardNotificationSlide {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }

      .card-notification-content {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .card-notification-icon {
        font-size: 1.5em;
      }

      .card-notification-text {
        text-align: left;
      }

      .card-notification-player {
        font-weight: bold;
        color: #4ecdc4;
      }

      .card-notification-card {
        color: #ffe66d;
      }

      /* System message styling for card plays */
      .chat-message.card-play {
        background: rgba(74, 144, 217, 0.2);
        padding: 4px 8px;
        border-radius: 4px;
        border-left: 3px solid #4a90d9;
      }

      /* Warning notification variant */
      .card-notification.warning {
        border-color: #f39c12;
        background: rgba(50, 40, 30, 0.95);
      }

      .card-notification.warning .card-notification-icon {
        color: #f39c12;
      }

      /* Card play notification variant */
      .card-notification.card-play {
        border-color: #9b59b6;
        background: rgba(40, 30, 50, 0.95);
      }

      .card-notification.card-play .card-notification-icon {
        color: #9b59b6;
      }

      /* Info notification variant (blue) */
      .card-notification.info {
        border-color: #3498db;
        background: rgba(30, 40, 55, 0.95);
      }

      .card-notification.info .card-notification-icon {
        color: #3498db;
      }

      /* Success notification variant (green) */
      .card-notification.success {
        border-color: #2ecc71;
        background: rgba(30, 50, 40, 0.95);
      }

      .card-notification.success .card-notification-icon {
        color: #2ecc71;
      }

      /* Danger notification variant (red) */
      .card-notification.danger {
        border-color: #e74c3c;
        background: rgba(50, 30, 30, 0.95);
      }

      .card-notification.danger .card-notification-icon {
        color: #e74c3c;
      }

      /* Turn notification variant (yellow) */
      .card-notification.turn {
        border-color: #f1c40f;
        background: rgba(50, 45, 25, 0.95);
      }

      .card-notification.turn .card-notification-icon {
        color: #f1c40f;
      }

      /* Active effects indicator */
      .active-effects {
        display: flex;
        gap: 4px;
        margin-top: 4px;
        flex-wrap: wrap;
      }

      .active-effect {
        font-size: 0.7em;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(155, 89, 182, 0.3);
        color: #bb8fce;
      }

      /* ============================================ */
      /* Mobile Responsive Styles */
      /* ============================================ */
      @media (max-width: 768px) {
        /* Connection Screen */
        .connection-panel {
          width: 90%;
          max-width: 350px;
          padding: 20px;
        }

        .connection-panel h1 {
          font-size: 1.8em;
        }

        /* Lobby Screen */
        .lobby-container {
          flex-direction: column;
          height: auto;
          max-height: 95vh;
          padding: 10px;
          overflow-y: auto;
        }

        .lobby-left-column {
          width: 100%;
          gap: 10px;
        }

        .lobby-slots-panel {
          min-height: auto;
          padding: 16px;
        }

        .lobby-slots-panel h2 {
          font-size: 1.3em;
          margin-bottom: 10px;
        }

        .slot-list {
          max-height: 200px;
          overflow-y: auto;
        }

        .slot-row {
          padding: 8px;
          flex-wrap: wrap;
          gap: 8px;
        }

        .slot-number {
          width: 50px;
          font-size: 0.9em;
        }

        .slot-content {
          flex: 1;
          min-width: 0;
        }

        .slot-player-name {
          font-size: 0.9em;
        }

        .slot-player-ip {
          font-size: 0.75em;
        }

        .lobby-right-panel {
          width: 100%;
          max-width: none;
          gap: 10px;
        }

        .lobby-info-panel,
        .lobby-unassigned-panel {
          padding: 10px;
        }

        .lobby-chat-panel {
          position: relative !important;
          width: 100% !important;
          height: 250px !important;
          max-width: none !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          resize: none !important;
        }

        .lobby-chat-panel .chat-header {
          display: none !important; /* Hide chat banner on mobile to save space */
        }

        .lobby-chat-panel .chat-messages {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow-y: auto !important;
          padding: 12px !important;
        }

        .lobby-chat-panel .chat-input-container {
          flex: 0 0 auto !important;
          display: flex !important;
          padding: 8px !important;
          border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
        }

        .unassigned-list {
          max-height: 100px;
        }

        /* Fix iOS auto-zoom on input focus - ensure 16px minimum */
        input, select, textarea {
          font-size: 16px !important;
        }

        .chat-input {
          font-size: 16px !important;
        }

        .form-group input {
          font-size: 16px !important;
        }

        .bid-inputs input,
        .bid-inputs select {
          font-size: 16px !important;
        }

        /* Game Screen */
        #game-screen {
          overflow-y: auto;
        }

        .top-bar {
          position: relative !important;
          height: auto !important;
          flex-wrap: wrap;
          padding: 8px;
          gap: 8px;
          z-index: 100;
        }

        .top-bar > div {
          font-size: 0.85em;
        }

        .pause-btn {
          padding: 6px 10px;
          font-size: 0.85em;
        }

        .players-panel {
          position: relative;
          width: 100% !important;
          max-width: none !important;
          top: auto;
          left: auto;
          max-height: none !important;
          margin-bottom: 10px;
          padding: 12px;
        }

        .player-status {
          padding: 8px;
          font-size: 0.9em;
        }

        .private-panel {
          position: relative;
          bottom: auto;
          left: auto;
          right: auto !important;
          width: 100%;
          flex-direction: column;
          padding: 12px;
          margin-bottom: 10px;
          gap: 16px;
        }

        .dice-section h3,
        .cards-section h3 {
          font-size: 1em;
          margin-bottom: 8px;
        }

        .die-display {
          width: 40px;
          height: 40px;
          font-size: 1.2em;
        }

        .cards-container {
          flex-wrap: wrap;
        }

        .card-display {
          width: 100px;
          min-height: 80px;
          padding: 8px;
        }

        .card-name {
          font-size: 0.8em;
        }

        .card-desc {
          font-size: 0.65em;
        }

        .action-panel {
          position: relative;
          bottom: auto;
          left: auto;
          right: auto !important;
          width: 100%;
          padding: 12px;
          margin-bottom: 10px;
        }

        .bid-controls {
          flex-direction: column;
          gap: 12px;
        }

        .bid-inputs {
          flex-wrap: wrap;
          justify-content: center;
        }

        .bid-inputs input,
        .bid-inputs select {
          width: 60px;
          padding: 6px 8px;
          font-size: 14px;
        }

        .action-buttons {
          flex-wrap: wrap;
          justify-content: center;
        }

        .action-buttons .btn {
          padding: 10px 16px;
          font-size: 14px;
        }

        .chat-panel {
          position: relative;
          bottom: auto;
          right: auto;
          width: 100% !important;
          height: 250px !important;
          max-width: none !important;
          resize: none;
        }

        .chat-panel .chat-header {
          display: none !important; /* Hide chat header on mobile to match lobby */
        }

        .chat-panel .chat-messages {
          padding-top: 12px !important; /* Extra padding since header is hidden */
        }

        /* Modal adjustments */
        .modal-content {
          width: 90%;
          max-width: 400px;
          padding: 20px;
          max-height: 80vh;
          overflow-y: auto;
        }

        .target-options {
          max-height: 200px;
        }

        .target-die {
          width: 35px;
          height: 35px;
          font-size: 1em;
        }

        .face-value-btn {
          width: 40px;
          height: 40px;
          font-size: 1.2em;
        }

        /* Card notification */
        .card-notification {
          width: 90%;
          max-width: 300px;
          padding: 12px 16px;
        }
      }

      /* Extra small screens */
      @media (max-width: 480px) {
        .connection-panel h1 {
          font-size: 1.5em;
        }

        .btn {
          padding: 10px 16px;
          font-size: 14px;
        }

        .slot-row {
          padding: 6px;
        }

        .slot-number {
          width: 40px;
          font-size: 0.8em;
        }

        .lobby-chat-panel {
          height: 250px !important;
        }

        .chat-panel {
          height: 250px !important;
        }

        .die-display {
          width: 35px;
          height: 35px;
          font-size: 1em;
        }

        .card-display {
          width: 85px;
          min-height: 70px;
          padding: 6px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  public setPlayerId(id: string): void {
    this.playerId = id;
  }

  public setIsHost(isHost: boolean): void {
    this.isHost = isHost;
    const startBtn = document.getElementById('start-game-btn');
    const startBtnHelp = document.getElementById('start-game-help');
    const waitingText = document.querySelector('.waiting-text') as HTMLElement;
    const hostSettingsPanel = document.getElementById('host-settings-panel');
    
    if (startBtn && waitingText) {
      startBtn.style.display = isHost ? 'block' : 'none';
      if (startBtnHelp) startBtnHelp.style.display = isHost ? 'inline-flex' : 'none';
      waitingText.style.display = isHost ? 'none' : 'block';
    }
    
    // Show/hide host settings panel
    if (hostSettingsPanel) {
      hostSettingsPanel.style.display = isHost ? 'block' : 'none';
    }
  }

  public updateSessionSettings(settings: { mode: string; maxPlayers: number; stage: string }): void {
    const gameModeSelect = document.getElementById('settings-game-mode') as HTMLSelectElement;
    const maxPlayersSelect = document.getElementById('settings-max-players') as HTMLSelectElement;
    const stageSelect = document.getElementById('settings-stage') as HTMLSelectElement;
    
    if (gameModeSelect && settings.mode) {
      gameModeSelect.value = settings.mode;
    }
    if (maxPlayersSelect && settings.maxPlayers) {
      maxPlayersSelect.value = String(settings.maxPlayers);
    }
    if (stageSelect && settings.stage) {
      stageSelect.value = settings.stage;
    }
  }

  public showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    document.getElementById(screenId)?.classList.add('active');
    
    // Hide main volume control on game screen (it has its own in top bar)
    const volumeControl = document.getElementById('volume-control');
    if (volumeControl) {
      volumeControl.style.display = screenId === 'game-screen' ? 'none' : 'flex';
    }
  }

  public showConnectionError(message: string): void {
    const errorEl = document.getElementById('connection-error');
    if (errorEl) {
      errorEl.textContent = message;
    }
  }

  public updateServerInfo(publicIp: string, port: number): void {
    const infoEl = document.getElementById('server-info');
    if (infoEl) {
      infoEl.innerHTML = `
        <div>Public IP: <strong>${publicIp}</strong></div>
        <div>Port: <strong>${port}</strong></div>
      `;
    }
  }

  public setBrowserPlayerName(playerName: string): void {
    const nameEl = document.getElementById('browser-player-name');
    if (nameEl) {
      nameEl.textContent = `Playing as: ${playerName}`;
    }
  }

  public updateSessionList(sessions: SessionInfo[], previousSessionId: string | null): void {
    const listEl = document.getElementById('session-list');
    if (!listEl) return;

    if (sessions.length === 0) {
      listEl.innerHTML = '<div class="session-empty">No active sessions. Create one to get started!</div>';
      return;
    }

    // Sort sessions - previous session first, then by creation time
    const sortedSessions = [...sessions].sort((a, b) => {
      if (a.id === previousSessionId) return -1;
      if (b.id === previousSessionId) return 1;
      return b.createdAt - a.createdAt;
    });

    listEl.innerHTML = sortedSessions.map(session => {
      const isPrevious = session.id === previousSessionId;
      const phaseClass = session.phase === 'lobby' ? 'lobby' : 
                         session.phase === 'paused' ? 'paused' : 'playing';
      const phaseText = session.phase === 'lobby' ? 'In Lobby' :
                        session.phase === 'paused' ? 'Paused' : 'In Progress';
      const isFull = session.playerCount >= session.maxPlayers;

      return `
        <div class="session-item ${isPrevious ? 'previous-session' : ''}" data-session-id="${session.id}">
          <div class="session-info">
            <div class="session-name">${this.escapeHtml(session.name)}</div>
            <div class="session-details">
              <span class="session-host">👑 ${this.escapeHtml(session.hostName)}</span>
              <span class="session-players">👥 ${session.playerCount}/${session.maxPlayers}</span>
              <span class="session-mode">${session.mode}</span>
              <span class="session-phase ${phaseClass}">${phaseText}</span>
            </div>
          </div>
          <button class="btn ${isPrevious ? 'warning' : 'primary'} session-join-btn" 
                  data-session-id="${session.id}"
                  ${isFull && !isPrevious ? 'disabled' : ''}>
            ${isPrevious ? 'Rejoin' : isFull ? 'Full' : 'Join'}
          </button>
        </div>
      `;
    }).join('');

    // Attach click handlers to join buttons
    listEl.querySelectorAll('.session-join-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessionId = (e.target as HTMLElement).dataset.sessionId;
        if (sessionId) {
          const playerName = (document.getElementById('player-name') as HTMLInputElement)?.value.trim() || 'Player';
          this.onJoinSession?.(sessionId, playerName);
        }
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public updateGameState(state: PublicGameState): void {
    // Check if it's becoming the player's turn
    const currentPlayer = state.players[state.currentTurnIndex];
    const isMyTurn = currentPlayer?.id === this.playerId;
    
    // Play sound when it becomes the player's turn (and game is in playing phase)
    if (isMyTurn && !this.wasMyTurn && state.phase === 'bidding') {
      this.playTurnSound();
    }
    
    // Update the turn tracking
    this.wasMyTurn = isMyTurn;
    
    this.gameState = state;
    this.updatePlayersList();
    this.updateTopBar();
    this.updateActionPanel();
  }

  private updatePlayersList(): void {
    if (!this.gameState) return;

    // WC3-style Lobby slot list
    const slotList = document.getElementById('slot-list');
    const unassignedList = document.getElementById('unassigned-list');
    
    if (slotList && this.gameState.phase === 'lobby') {
      const maxSlots = this.gameState.settings.maxPlayers;
      const myPlayer = this.gameState.players.find(p => p.id === this.playerId);
      const mySlot = myPlayer?.slot;
      
      // Render slot rows
      let slotsHtml = '';
      for (let i = 0; i < maxSlots; i++) {
        const playerInSlot = this.gameState.players.find(p => p.slot === i);
        const isOccupied = !!playerInSlot;
        const isMySlot = mySlot === i;
        
        slotsHtml += `
          <div class="slot-row ${isOccupied ? 'occupied' : 'empty'}">
            <div class="slot-number">Slot ${i + 1}</div>
            <div class="slot-content">
              ${isOccupied ? `
                <span class="slot-player-name ${playerInSlot.isHost ? 'host' : ''}">${playerInSlot.name}</span>
                <span class="slot-player-ip">(${playerInSlot.ip})</span>
                <span>${playerInSlot.isConnected ? '🟢' : '🔴'}</span>
              ` : `
                <span class="slot-empty-text">Open</span>
              `}
            </div>
            <div class="slot-actions">
              ${!isOccupied && mySlot === null ? `
                <button class="slot-select" data-slot="${i}">Join</button>
              ` : ''}
              ${isMySlot ? `
                <button class="slot-select" data-slot="leave">Leave</button>
              ` : ''}
              ${this.isHost && isOccupied && playerInSlot.id !== this.playerId ? `
                <button class="kick-btn" data-player-id="${playerInSlot.id}">Kick</button>
              ` : ''}
            </div>
          </div>
        `;
      }
      slotList.innerHTML = slotsHtml;

      // Add slot selection event listeners
      slotList.querySelectorAll('.slot-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const slotStr = (e.target as HTMLElement).getAttribute('data-slot');
          if (slotStr === 'leave') {
            this.onSelectSlot?.(null);
          } else if (slotStr !== null) {
            this.onSelectSlot?.(parseInt(slotStr, 10));
          }
        });
      });

      // Add kick button event listeners
      slotList.querySelectorAll('.kick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const playerId = (e.target as HTMLElement).getAttribute('data-player-id');
          if (playerId) {
            this.onKickPlayer?.(playerId);
          }
        });
      });
    }

    // Render unassigned players
    if (unassignedList && this.gameState.phase === 'lobby') {
      const unassignedPlayers = this.gameState.players.filter(p => p.slot === null);
      
      if (unassignedPlayers.length === 0) {
        unassignedList.innerHTML = '<div class="slot-empty-text">No unassigned players</div>';
      } else {
        unassignedList.innerHTML = unassignedPlayers.map(p => `
          <div class="unassigned-item">
            <div>
              <span class="unassigned-name">${p.name}${p.isHost ? ' 👑' : ''}</span>
              <span class="unassigned-ip">(${p.ip})</span>
            </div>
            <div>
              <span>${p.isConnected ? '🟢' : '🔴'}</span>
              ${this.isHost && p.id !== this.playerId ? `<button class="kick-btn" data-player-id="${p.id}">Kick</button>` : ''}
            </div>
          </div>
        `).join('');

        // Add kick button event listeners for unassigned list
        unassignedList.querySelectorAll('.kick-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const playerId = (e.target as HTMLElement).getAttribute('data-player-id');
            if (playerId) {
              this.onKickPlayer?.(playerId);
            }
          });
        });
      }
    }

    // Game player panel
    const playersPanel = document.getElementById('players-panel');
    if (playersPanel && this.gameState.phase !== 'lobby') {
      const currentPlayer = this.gameState.players[this.gameState.currentTurnIndex];
      playersPanel.innerHTML = `
        <h3>Players</h3>
        ${this.gameState.players.map(p => `
          <div class="player-status ${p.id === currentPlayer?.id ? 'current-turn' : ''} ${p.isEliminated ? 'eliminated' : ''}" data-player-id="${p.id}">
            <div class="player-name">${p.name} ${p.id === this.playerId ? '(You)' : ''}</div>
            <div class="player-stats">
              🎲 ${p.diceCount} dice | 🃏 ${p.cardCount} cards
            </div>
            ${this.renderActiveEffects(p.activeEffects)}
          </div>
        `).join('')}
      `;
    }
  }

  private renderActiveEffects(effects: any): string {
    if (!effects) return '';
    
    const activeEffectsList: string[] = [];
    
    if (effects.insurance) activeEffectsList.push('🛡️ Insurance');
    if (effects.doubleDudo) activeEffectsList.push('⚔️ Double Dudo');
    if (effects.phantomBid) activeEffectsList.push('👻 Phantom Bid');
    if (effects.lateDudo) activeEffectsList.push('⏰ Late Dudo');
    
    if (activeEffectsList.length === 0) return '';
    
    return `
      <div class="active-effects">
        ${activeEffectsList.map(effect => `<span class="active-effect">${effect}</span>`).join('')}
      </div>
    `;
  }

  private updateTopBar(): void {
    if (!this.gameState) return;

    const roundInfo = document.getElementById('round-info');
    const currentBid = document.getElementById('current-bid');
    const turnIndicator = document.getElementById('turn-indicator');

    if (roundInfo) {
      roundInfo.textContent = `Round ${this.gameState.roundNumber}`;
    }

    if (currentBid) {
      if (this.gameState.currentBid) {
        const bid = this.gameState.currentBid;
        currentBid.textContent = `Current Bid: ${bid.quantity}× ${bid.faceValue}${bid.faceValue === 1 ? ' (Wild)' : ''}s`;
      } else {
        currentBid.textContent = 'No bid yet';
      }
    }

    if (turnIndicator) {
      const currentPlayer = this.gameState.players[this.gameState.currentTurnIndex];
      if (currentPlayer) {
        const isMyTurn = currentPlayer.id === this.playerId;
        turnIndicator.textContent = isMyTurn ? "Your Turn!" : `${currentPlayer.name}'s turn`;
        turnIndicator.style.color = isMyTurn ? '#4ecdc4' : '#ffe66d';
      }
    }
  }

  private updateActionPanel(): void {
    if (!this.gameState) return;

    const bidBtn = document.getElementById('bid-btn') as HTMLButtonElement;
    const dudoBtn = document.getElementById('dudo-btn') as HTMLButtonElement;
    const jontiBtn = document.getElementById('jonti-btn') as HTMLButtonElement;
    const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;

    const currentPlayer = this.gameState.players[this.gameState.currentTurnIndex];
    const isMyTurn = currentPlayer?.id === this.playerId;
    const canDudo = this.gameState.currentBid !== null;
    const isPaused = this.gameState.phase === 'paused';

    if (bidBtn) {
      bidBtn.disabled = !isMyTurn || this.gameState.phase !== 'bidding' || isPaused;
    }

    if (dudoBtn) {
      dudoBtn.disabled = !isMyTurn || !canDudo || this.gameState.phase !== 'bidding' || isPaused;
    }

    if (jontiBtn) {
      // Jonti can only be called when there's a current bid
      jontiBtn.disabled = !isMyTurn || !canDudo || this.gameState.phase !== 'bidding' || isPaused;
    }

    // Update pause button visibility and state
    if (pauseBtn) {
      // Show pause button only during active game phases
      const canPause = ['rolling', 'bidding', 'dudo_called', 'round_end'].includes(this.gameState.phase);
      pauseBtn.style.display = canPause || isPaused ? 'block' : 'none';
      
      if (isPaused) {
        pauseBtn.textContent = '⏸ Paused';
        pauseBtn.disabled = true;
      } else {
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.disabled = false;
      }
    }

    // Show/hide paused overlay based on game state
    if (isPaused) {
      this.showPausedOverlay();
    } else if (this.gameState.pausedFromPhase === null) {
      // Only hide if we're not in a paused state
      const pausedModal = document.getElementById('paused-modal');
      if (pausedModal?.classList.contains('active')) {
        this.hidePausedOverlay();
      }
    }
  }

  public updatePrivateInfo(dice: Die[], cards: Card[]): void {
    this.privateInfo = { dice, cards };
    this.renderPrivateDice();
    this.renderPrivateCards();
  }

  private renderPrivateDice(): void {
    if (!this.privateInfo) return;

    const container = document.getElementById('my-dice');
    if (!container) return;

    container.innerHTML = this.privateInfo.dice.map(die => `
      <div class="die-display die-${die.type}" data-die-id="${die.id}">
        ${die.faceValue}
        <span class="die-type">${die.type}</span>
      </div>
    `).join('');
  }

  private renderPrivateCards(): void {
    if (!this.privateInfo) return;

    const container = document.getElementById('my-cards');
    if (!container) return;

    const currentTiming = this.getCurrentCardTiming();
    
    container.innerHTML = this.privateInfo.cards.map(card => {
      const canPlay = this.canPlayCardNow(card, currentTiming);
      const timingLabel = this.getTimingLabel(card.timing);
      
      return `
        <div class="card-display ${canPlay ? '' : 'disabled'}" 
             data-card-id="${card.id}" 
             onclick="window.gameUI?.playCard('${card.id}')"
             title="${card.description}">
          <div class="card-timing ${canPlay ? 'can-play' : ''}">${timingLabel}</div>
          <div class="card-name">${card.name}</div>
          <div class="card-desc">${card.description}</div>
        </div>
      `;
    }).join('');
  }

  private getCurrentCardTiming(): string {
    if (!this.gameState) return 'none';
    
    const phase = this.gameState.phase;
    const isMyTurn = this.gameState.players[this.gameState.currentTurnIndex]?.id === this.playerId;
    
    if (phase === 'bidding') {
      if (isMyTurn) {
        return 'on_turn';
      } else {
        return 'reaction';
      }
    } else if (phase === 'dudo_called') {
      return 'on_dudo';
    }
    
    return 'none';
  }

  private canPlayCardNow(card: Card, currentTiming: string): boolean {
    if (currentTiming === 'none') return false;
    if (card.timing === 'any') return true;
    
    // on_turn cards can only be played on your turn
    if (card.timing === 'on_turn' && currentTiming === 'on_turn') return true;
    
    // reaction cards can be played when it's not your turn (reacting to others)
    if (card.timing === 'reaction' && (currentTiming === 'reaction' || currentTiming === 'on_turn')) return true;
    
    // on_dudo cards can be played when dudo is called
    if (card.timing === 'on_dudo' && currentTiming === 'on_dudo') return true;
    
    return false;
  }

  private getTimingLabel(timing: string): string {
    switch (timing) {
      case 'on_turn': return '⏱ Your Turn';
      case 'reaction': return '⚡ Reaction';
      case 'on_dudo': return '🎯 On Dudo';
      case 'any': return '✨ Anytime';
      default: return timing;
    }
  }


  public showDudoResult(result: DudoResult, cardDrawInfo?: { playerId: string; playerName: string }): void {
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    const details = document.getElementById('result-details');
    const revealedDice = document.getElementById('revealed-dice');

    if (!modal || !title || !details || !revealedDice) return;

    const callerName = this.gameState?.players.find(p => p.id === result.callerId)?.name || 'Unknown';
    const bidderName = this.gameState?.players.find(p => p.id === result.targetPlayerId)?.name || 'Unknown';
    const loserName = this.gameState?.players.find(p => p.id === result.loserId)?.name || 'Unknown';

    title.textContent = result.success ? '✅ Dudo Successful!' : '❌ Dudo Failed!';
    details.innerHTML = `
      <p><strong>${callerName}</strong> called Dudo on <strong>${bidderName}</strong>'s bid</p>
      <p>Bid: ${result.bid.quantity}× ${result.bid.faceValue}s</p>
      <p>Actual count: <strong>${result.actualCount}</strong></p>
      <p><strong>${loserName}</strong> loses a die!</p>
    `;

    revealedDice.innerHTML = result.revealedDice.map(({ playerId, dice }) => {
      const playerName = this.gameState?.players.find(p => p.id === playerId)?.name || 'Unknown';
      return `
        <div class="revealed-player">
          <div class="revealed-player-name">${playerName}</div>
          <div class="revealed-dice-row">
            ${dice.map(die => `
              <div class="mini-die die-${die.type}">${die.faceValue}</div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Store pending card draw info for animation after continue button
    this.pendingCardDraw = cardDrawInfo || null;

    this.showModal('result-modal');
  }

  public showJontiResult(result: JontiResult): void {
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    const details = document.getElementById('result-details');
    const revealedDice = document.getElementById('revealed-dice');

    if (!modal || !title || !details || !revealedDice) return;

    const callerName = this.gameState?.players.find(p => p.id === result.callerId)?.name || 'Unknown';

    if (result.success) {
      title.textContent = '🎯 Jonti Successful!';
      details.innerHTML = `
        <p><strong>${callerName}</strong> called Jonti!</p>
        <p>Bid: ${result.bid.quantity}× ${result.bid.faceValue}s</p>
        <p>Actual count: <strong>${result.actualCount}</strong></p>
        <p>The bid was <strong>exactly correct!</strong></p>
        <p><strong>${callerName}</strong> gains a die!</p>
      `;
    } else {
      title.textContent = '❌ Jonti Failed!';
      details.innerHTML = `
        <p><strong>${callerName}</strong> called Jonti!</p>
        <p>Bid: ${result.bid.quantity}× ${result.bid.faceValue}s</p>
        <p>Actual count: <strong>${result.actualCount}</strong></p>
        <p>The bid was <strong>not exactly correct!</strong></p>
        <p><strong>${callerName}</strong> loses a die!</p>
      `;
    }

    revealedDice.innerHTML = result.revealedDice.map(({ playerId, dice }) => {
      const playerName = this.gameState?.players.find(p => p.id === playerId)?.name || 'Unknown';
      return `
        <div class="revealed-player">
          <div class="revealed-player-name">${playerName}</div>
          <div class="revealed-dice-row">
            ${dice.map(die => `
              <div class="mini-die die-${die.type}">${die.faceValue}</div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    this.showModal('result-modal');
  }


  public showGameOver(winnerName: string): void {
    const winnerText = document.getElementById('winner-text');
    if (winnerText) {
      winnerText.textContent = `${winnerName} wins the game!`;
    }
    this.showModal('gameover-modal');
  }

  public showCardResult(cardType: string, cardName: string, result: any): void {
    const modal = document.getElementById('result-modal');
    const title = document.getElementById('result-title');
    const details = document.getElementById('result-details');
    const revealedDice = document.getElementById('revealed-dice');

    if (!modal || !title || !details || !revealedDice) return;

    title.textContent = `🃏 ${cardName} Result`;
    
    let detailsHtml = '';
    let diceHtml = '';

    switch (cardType) {
      case 'peek':
        if (result.die) {
          detailsHtml = `
            <p>You peeked at a die!</p>
            <p>Die type: <strong>${result.die.type}</strong></p>
            <p>Face value: <strong>${result.die.faceValue}</strong></p>
          `;
          diceHtml = `
            <div class="revealed-player">
              <div class="revealed-player-name">Peeked Die</div>
              <div class="revealed-dice-row">
                <div class="mini-die die-${result.die.type}">${result.die.faceValue}</div>
              </div>
            </div>
          `;
        }
        break;

      case 'gauge':
        if (result.dieInfos && result.dieInfos.length > 0) {
          detailsHtml = `
            <p>You gauged ${result.dieInfos.length} dice!</p>
            <p>You can see their sizes (types) but not their face values.</p>
          `;
          diceHtml = result.dieInfos.map((info: any) => `
            <div class="revealed-player">
              <div class="revealed-player-name">${info.playerName}'s die</div>
              <div class="revealed-dice-row">
                <div class="mini-die die-${info.dieType}">?</div>
              </div>
              <div class="die-type-label">Type: ${info.dieType}</div>
            </div>
          `).join('');
        }
        break;

      case 'reroll_one':
        detailsHtml = `<p>You re-rolled one of your dice!</p><p>Check your dice to see the new value.</p>`;
        break;

      case 'polish':
        detailsHtml = `<p>You upgraded one of your dice!</p><p>Check your dice to see the new type.</p>`;
        break;

      case 'crack':
        detailsHtml = `<p>You cracked an opponent's die!</p><p>Their die has been downgraded.</p>`;
        break;

      case 'inflation':
        detailsHtml = `<p>You inflated the current bid!</p><p>The bid quantity has been increased by 1.</p>`;
        break;

      case 'wild_shift':
        detailsHtml = `<p>You shifted the bid's face value!</p><p>The bid now targets a different number.</p>`;
        break;

      case 'blind_swap':
        detailsHtml = `<p>You swapped a die with another player!</p><p>Check your dice to see what you got.</p>`;
        break;

      case 'insurance':
        detailsHtml = `<p>Insurance is now active!</p><p>If your next Dudo fails, you won't lose a die.</p>`;
        break;

      case 'double_dudo':
        detailsHtml = `<p>Double Dudo is now active!</p><p>Your next Dudo will have double stakes!</p>`;
        break;

      case 'phantom_bid':
        detailsHtml = `<p>Phantom Bid is now active!</p><p>Your next bid can ignore normal increment rules.</p>`;
        break;

      case 'false_tell':
        detailsHtml = `<p>You announced a false tell!</p><p>Other players think you peeked at a die.</p>`;
        break;

      case 'late_dudo':
        detailsHtml = `<p>Late Dudo is now active!</p><p>You can call Dudo on a previous bid.</p>`;
        break;

      default:
        detailsHtml = `<p>Card effect applied!</p>`;
    }

    details.innerHTML = detailsHtml;
    revealedDice.innerHTML = diceHtml;

    this.showModal('result-modal');
  }

  public addChatMessage(playerName: string, message: string): void {
    // Add to both game chat and lobby chat
    const containers = [
      document.getElementById('chat-messages'),
      document.getElementById('lobby-chat-messages')
    ];

    for (const container of containers) {
      if (!container) continue;
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-message';
      msgEl.innerHTML = `<span class="sender">${playerName}:</span> ${message}`;
      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
    }
  }

  public playCardDrawAnimation(targetPlayerId?: string): void {
    // Since the 3D deck is at the center of the game canvas, 
    // we'll start the animation from the center of the viewport
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return;
    
    const containerRect = gameContainer.getBoundingClientRect();
    const startX = containerRect.left + containerRect.width / 2;
    const startY = containerRect.top + containerRect.height / 2;
    
    // Determine if this card is going to the current player
    const isForCurrentPlayer = targetPlayerId === this.playerId;
    
    // Get the player name for display
    let playerName = 'Unknown';
    if (targetPlayerId) {
      const player = this.gameState?.players.find(p => p.id === targetPlayerId);
      playerName = player?.name || 'Unknown';
      if (isForCurrentPlayer) {
        playerName = 'You';
      }
    }
    
    // Find target element
    let targetRect: DOMRect;
    let targetElement: Element | null = null;
    
    if (isForCurrentPlayer) {
      // Target the "my-cards" container for a satisfying snap
      targetElement = document.getElementById('my-cards');
      if (!targetElement) {
        targetElement = document.getElementById('private-panel');
      }
    } else if (targetPlayerId) {
      // Try to find the player element in the players panel
      targetElement = document.querySelector(`[data-player-id="${targetPlayerId}"]`);
    }
    
    if (!targetElement) {
      // Fallback to private panel
      targetElement = document.getElementById('private-panel');
    }
    
    if (!targetElement) return;
    targetRect = targetElement.getBoundingClientRect();
    
    // Create animated card element
    const animCard = document.createElement('div');
    animCard.className = isForCurrentPlayer ? 'card-drawing card-drawing-to-self' : 'card-drawing card-drawing-to-other';
    animCard.style.left = `${startX - 35}px`;
    animCard.style.top = `${startY - 50}px`;
    
    // Add player name label to the card
    const nameLabel = document.createElement('div');
    nameLabel.className = 'card-drawing-label';
    nameLabel.textContent = isForCurrentPlayer ? '→ You!' : `→ ${playerName}`;
    animCard.appendChild(nameLabel);
    
    // Add card icon
    const cardIcon = document.createElement('div');
    cardIcon.className = 'card-drawing-icon';
    cardIcon.textContent = '🃏';
    animCard.appendChild(cardIcon);
    
    // Calculate target position (center of target element)
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    
    // Set CSS custom properties for animation target
    animCard.style.setProperty('--target-x', `${targetX - startX + 35}px`);
    animCard.style.setProperty('--target-y', `${targetY - startY + 50}px`);
    
    document.body.appendChild(animCard);
    
    // For current player, add a highlight effect to the cards container
    if (isForCurrentPlayer && targetElement) {
      targetElement.classList.add('card-receiving');
      setTimeout(() => {
        targetElement?.classList.remove('card-receiving');
      }, 1200);
    }
    
    // Remove after animation completes
    const animDuration = isForCurrentPlayer ? 1000 : 900;
    setTimeout(() => {
      animCard.remove();
    }, animDuration);
  }


  public addSystemMessage(message: string, isCardPlay: boolean = false): void {
    // Add to both game chat and lobby chat
    const containers = [
      document.getElementById('chat-messages'),
      document.getElementById('lobby-chat-messages')
    ];

    for (const container of containers) {
      if (!container) continue;
      const msgEl = document.createElement('div');
      msgEl.className = `chat-message system ${isCardPlay ? 'card-play' : ''}`;
      msgEl.innerHTML = `<em>${message}</em>`;
      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
    }
  }

  public showCardPlayedNotification(playerName: string, cardName: string, cardType: string, isOwnCard: boolean): void {
    // Don't show notification for own cards (they get the result modal)
    if (isOwnCard) return;

    // Get card icon based on type
    const icon = this.getCardIcon(cardType);
    
    // Show prominent notification
    this.showNotification(
      icon,
      `<span class="card-notification-player">${playerName}</span> played <span class="card-notification-card">${cardName}</span>`,
      'card-play'
    );

    // Also add to chat with special styling
    this.addSystemMessage(`🃏 ${playerName} played ${cardName}`, true);
  }

  private getCardIcon(cardType: string): string {
    switch (cardType) {
      case 'peek': return '👁️';
      case 'gauge': return '📏';
      case 'false_tell': return '🎭';
      case 'inflation': return '📈';
      case 'wild_shift': return '🔄';
      case 'phantom_bid': return '👻';
      case 'insurance': return '🛡️';
      case 'double_dudo': return '⚔️';
      case 'late_dudo': return '⏰';
      case 'reroll_one': return '🎲';
      case 'blind_swap': return '🔀';
      case 'polish': return '✨';
      case 'crack': return '💥';
      default: return '🃏';
    }
  }


  private showModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
      modal.classList.add('active');
    }
  }

  private hideModal(modalId: string): void {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
  }

  public showPausedOverlay(): void {
    this.showModal('paused-modal');
    // Update pause button to show it's paused
    const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
    if (pauseBtn) {
      pauseBtn.textContent = '⏸ Paused';
      pauseBtn.disabled = true;
    }
  }

  public hidePausedOverlay(): void {
    this.hideModal('paused-modal');
    // Reset pause button
    const pauseBtn = document.getElementById('pause-btn') as HTMLButtonElement;
    if (pauseBtn) {
      pauseBtn.textContent = '⏸ Pause';
      pauseBtn.disabled = false;
    }
  }

  public playCard(cardId: string): void {
    const card = this.privateInfo?.cards.find(c => c.id === cardId);
    if (!card) return;

    // Check if card can be played now
    const currentTiming = this.getCurrentCardTiming();
    if (!this.canPlayCardNow(card, currentTiming)) {
      this.showCardTimingError(card);
      return;
    }

    // Cards that need targeting
    const needsTargetDie = ['reroll_one', 'polish'];
    const needsTargetPlayerAndDie = ['crack', 'peek', 'blind_swap'];
    const needsTwoDice = ['gauge'];
    const needsFaceValue = ['wild_shift'];
    const noTargetNeeded = ['inflation', 'insurance', 'double_dudo', 'late_dudo', 'phantom_bid', 'false_tell'];

    if (noTargetNeeded.includes(card.type)) {
      // Play immediately without targeting
      this.onPlayCard?.(cardId);
      return;
    }

    // Store the pending card and show targeting UI
    this.pendingCard = card;
    this.selectedTargetPlayerId = null;
    this.selectedTargetDieId = null;
    this.selectedDieIds = [];

    if (needsTargetDie.includes(card.type)) {
      this.showDieTargetingUI(card, 'own');
    } else if (needsTargetPlayerAndDie.includes(card.type)) {
      this.showPlayerDieTargetingUI(card);
    } else if (needsTwoDice.includes(card.type)) {
      this.showMultiDieTargetingUI(card, 2);
    } else if (needsFaceValue.includes(card.type)) {
      this.showFaceValueTargetingUI(card);
    } else {
      // Unknown card type, try to play without target
      this.onPlayCard?.(cardId);
    }
  }

  private showCardTimingError(card: Card): void {
    let message = '';
    switch (card.timing) {
      case 'on_turn':
        message = `"${card.name}" can only be played on your turn during bidding.`;
        break;
      case 'reaction':
        message = `"${card.name}" can only be played as a reaction during bidding.`;
        break;
      case 'on_dudo':
        message = `"${card.name}" can only be played when Dudo is called.`;
        break;
      default:
        message = `"${card.name}" cannot be played right now.`;
    }
    
    this.showNotification('⚠️', message, 'warning');
  }

  public showNotification(icon: string, message: string, type: string = 'info'): void {
    // Remove any existing notification
    const existing = document.querySelector('.card-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = `card-notification ${type}`;
    notification.innerHTML = `
      <div class="card-notification-content">
        <div class="card-notification-icon">${icon}</div>
        <div class="card-notification-text">${message}</div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(-50%) translateY(-20px)';
      notification.style.transition = 'all 0.3s ease-out';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }


  private showDieTargetingUI(card: Card, targetType: 'own' | 'opponent'): void {
    const title = document.getElementById('card-target-title');
    const desc = document.getElementById('card-target-description');
    const options = document.getElementById('card-target-options');
    
    if (!title || !desc || !options) return;

    title.textContent = `Use ${card.name}`;
    desc.textContent = 'Select one of your dice:';

    const myDice = this.privateInfo?.dice || [];
    options.innerHTML = `
      <div class="target-dice">
        ${myDice.map(die => `
          <div class="target-die die-${die.type}" 
               data-die-id="${die.id}"
               onclick="window.gameUI?.selectTargetDie('${die.id}')">
            ${die.faceValue}
          </div>
        `).join('')}
      </div>
      <button class="btn primary" id="confirm-target-btn" onclick="window.gameUI?.confirmCardPlay()">Confirm</button>
    `;

    this.showModal('card-target-modal');
  }

  private showPlayerDieTargetingUI(card: Card): void {
    const title = document.getElementById('card-target-title');
    const desc = document.getElementById('card-target-description');
    const options = document.getElementById('card-target-options');
    
    if (!title || !desc || !options || !this.gameState) return;

    title.textContent = `Use ${card.name}`;
    
    if (card.type === 'blind_swap') {
      desc.textContent = 'Select your die to swap, then select a target player:';
    } else {
      desc.textContent = 'Select a target player and their die:';
    }

    // For blind_swap, show own dice first
    let html = '';
    if (card.type === 'blind_swap') {
      const myDice = this.privateInfo?.dice || [];
      html += `
        <div class="target-section">
          <div class="target-player">Your Dice:</div>
          <div class="target-dice">
            ${myDice.map(die => `
              <div class="target-die die-${die.type}" 
                   data-die-id="${die.id}"
                   onclick="window.gameUI?.selectOwnDie('${die.id}')">
                ${die.faceValue}
              </div>
            `).join('')}
          </div>
        </div>
        <hr style="margin: 10px 0; border-color: #4a5568;">
        <div class="target-player">Select Target Player:</div>
      `;
    }

    // Show other players
    const otherPlayers = this.gameState.players.filter(p => 
      p.id !== this.playerId && !p.isEliminated && p.diceCount > 0
    );

    html += otherPlayers.map(player => `
      <div class="target-option" data-player-id="${player.id}" onclick="window.gameUI?.selectTargetPlayer('${player.id}')">
        <div class="target-player">${player.name}</div>
        <div class="target-dice">
          ${Array(player.diceCount).fill(0).map((_, i) => `
            <div class="target-die" 
                 data-player-id="${player.id}"
                 data-die-index="${i}"
                 onclick="event.stopPropagation(); window.gameUI?.selectOpponentDie('${player.id}', ${i})">
              ?
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');

    html += `<button class="btn primary" id="confirm-target-btn" onclick="window.gameUI?.confirmCardPlay()">Confirm</button>`;
    options.innerHTML = html;

    this.showModal('card-target-modal');
  }

  private showMultiDieTargetingUI(card: Card, count: number): void {
    const title = document.getElementById('card-target-title');
    const desc = document.getElementById('card-target-description');
    const options = document.getElementById('card-target-options');
    
    if (!title || !desc || !options || !this.gameState) return;

    title.textContent = `Use ${card.name}`;
    desc.textContent = `Select ${count} dice from any players to view their sizes:`;

    const allPlayers = this.gameState.players.filter(p => !p.isEliminated && p.diceCount > 0);

    options.innerHTML = allPlayers.map(player => `
      <div class="target-option" data-player-id="${player.id}">
        <div class="target-player">${player.name}${player.id === this.playerId ? ' (You)' : ''}</div>
        <div class="target-dice">
          ${Array(player.diceCount).fill(0).map((_, i) => `
            <div class="target-die" 
                 data-player-id="${player.id}"
                 data-die-index="${i}"
                 onclick="window.gameUI?.toggleDieSelection('${player.id}', ${i})">
              ?
            </div>
          `).join('')}
        </div>
      </div>
    `).join('') + `
      <div id="selection-count">Selected: 0/${count}</div>
      <button class="btn primary" id="confirm-target-btn" onclick="window.gameUI?.confirmCardPlay()">Confirm</button>
    `;

    this.showModal('card-target-modal');
  }

  private showFaceValueTargetingUI(card: Card): void {
    const title = document.getElementById('card-target-title');
    const desc = document.getElementById('card-target-description');
    const options = document.getElementById('card-target-options');
    
    if (!title || !desc || !options) return;

    title.textContent = `Use ${card.name}`;
    desc.textContent = 'Select the new face value for the current bid:';

    options.innerHTML = `
      <div class="face-value-options">
        ${[1, 2, 3, 4, 5, 6].map(val => `
          <button class="face-value-btn" data-value="${val}" onclick="window.gameUI?.selectFaceValue(${val})">${val}</button>
        `).join('')}
      </div>
      <button class="btn primary" id="confirm-target-btn" onclick="window.gameUI?.confirmCardPlay()">Confirm</button>
    `;

    this.showModal('card-target-modal');
  }

  public selectTargetDie(dieId: string): void {
    this.selectedTargetDieId = dieId;
    // Update UI to show selection
    document.querySelectorAll('.target-die').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.target-die[data-die-id="${dieId}"]`)?.classList.add('selected');
  }

  public selectOwnDie(dieId: string): void {
    this.selectedTargetDieId = dieId;
    // Update UI to show selection
    document.querySelectorAll('.target-section .target-die').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.target-die[data-die-id="${dieId}"]`)?.classList.add('selected');
  }

  public selectTargetPlayer(playerId: string): void {
    this.selectedTargetPlayerId = playerId;
    // Update UI to show selection
    document.querySelectorAll('.target-option').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.target-option[data-player-id="${playerId}"]`)?.classList.add('selected');
  }

  public selectOpponentDie(playerId: string, dieIndex: number): void {
    this.selectedTargetPlayerId = playerId;
    // For opponent dice, we use the index as a pseudo-ID since we don't know actual IDs
    this.selectedTargetDieId = `opponent-${playerId}-${dieIndex}`;
    
    // Update UI
    document.querySelectorAll('.target-option').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.target-die[data-player-id]').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.target-option[data-player-id="${playerId}"]`)?.classList.add('selected');
    document.querySelector(`.target-die[data-player-id="${playerId}"][data-die-index="${dieIndex}"]`)?.classList.add('selected');
  }

  public toggleDieSelection(playerId: string, dieIndex: number): void {
    const dieKey = `${playerId}-${dieIndex}`;
    const idx = this.selectedDieIds.indexOf(dieKey);
    
    if (idx >= 0) {
      this.selectedDieIds.splice(idx, 1);
    } else if (this.selectedDieIds.length < 2) {
      this.selectedDieIds.push(dieKey);
    }
    
    // Update UI
    document.querySelectorAll('.target-die[data-player-id]').forEach(el => {
      const pId = el.getAttribute('data-player-id');
      const dIdx = el.getAttribute('data-die-index');
      if (this.selectedDieIds.includes(`${pId}-${dIdx}`)) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
    
    const countEl = document.getElementById('selection-count');
    if (countEl) {
      countEl.textContent = `Selected: ${this.selectedDieIds.length}/2`;
    }
  }

  public selectFaceValue(value: number): void {
    this.selectedTargetDieId = `face-${value}`;
    // Update UI
    document.querySelectorAll('.face-value-btn').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.face-value-btn[data-value="${value}"]`)?.classList.add('selected');
  }

  public confirmCardPlay(): void {
    if (!this.pendingCard) return;

    const cardId = this.pendingCard.id;
    const cardType = this.pendingCard.type;

    let targetPlayerId: string | undefined;
    let targetDieId: string | undefined;
    let additionalData: any;

    switch (cardType) {
      case 'reroll_one':
      case 'polish':
        if (!this.selectedTargetDieId) {
          alert('Please select a die');
          return;
        }
        targetDieId = this.selectedTargetDieId;
        break;

      case 'crack':
      case 'peek':
        if (!this.selectedTargetPlayerId || !this.selectedTargetDieId) {
          alert('Please select a target player and die');
          return;
        }
        targetPlayerId = this.selectedTargetPlayerId;
        // For opponent dice, we need to send the index and let server resolve
        if (this.selectedTargetDieId.startsWith('opponent-')) {
          const parts = this.selectedTargetDieId.split('-');
          additionalData = { dieIndex: parseInt(parts[parts.length - 1]) };
          targetDieId = undefined; // Will be resolved server-side
        } else {
          targetDieId = this.selectedTargetDieId;
        }
        break;

      case 'blind_swap':
        if (!this.selectedTargetDieId || !this.selectedTargetPlayerId) {
          alert('Please select your die and a target player');
          return;
        }
        targetPlayerId = this.selectedTargetPlayerId;
        targetDieId = this.selectedTargetDieId;
        break;

      case 'gauge':
        if (this.selectedDieIds.length !== 2) {
          alert('Please select exactly 2 dice');
          return;
        }
        additionalData = { dieIds: this.selectedDieIds };
        break;

      case 'wild_shift':
        if (!this.selectedTargetDieId?.startsWith('face-')) {
          alert('Please select a face value');
          return;
        }
        additionalData = { faceValue: parseInt(this.selectedTargetDieId.split('-')[1]) };
        break;
    }

    this.hideModal('card-target-modal');
    this.pendingCard = null;
    this.onPlayCard?.(cardId, targetPlayerId, targetDieId, additionalData);
  }
}

// Expose for inline onclick handlers
declare global {
  interface Window {
    gameUI?: UIManager;
  }
}
