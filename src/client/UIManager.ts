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
  GamePhase 
} from '../shared/types';

export class UIManager {
  private container: HTMLElement;
  private gameState: PublicGameState | null = null;
  private privateInfo: { dice: Die[]; cards: Card[] } | null = null;
  private playerId: string = '';
  private isHost: boolean = false;
  private pendingCard: Card | null = null;
  private selectedTargetPlayerId: string | null = null;
  private selectedTargetDieId: string | null = null;
  private selectedDieIds: string[] = [];
  private wasMyTurn: boolean = false;

  // Callbacks
  public onStartGame: (() => void) | null = null;
  public onMakeBid: ((quantity: number, faceValue: number) => void) | null = null;
  public onCallDudo: (() => void) | null = null;
  public onCallJonti: (() => void) | null = null;
  public onPlayCard: ((cardId: string, targetPlayerId?: string, targetDieId?: string, additionalData?: any) => void) | null = null;
  public onReadyForRound: (() => void) | null = null;
  public onSendChat: ((message: string) => void) | null = null;
  public onConnect: ((host: string, port: number, playerName: string) => void) | null = null;
  public onNewGame: (() => void) | null = null;
  public onPauseGame: (() => void) | null = null;
  public onResumeGame: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.createUI();
  }

  private createUI(): void {
    this.container.innerHTML = `
      <div id="game-ui">
        <!-- Connection Screen -->
        <div id="connection-screen" class="screen active">
          <div class="panel connection-panel">
            <h1>🎲 Perudo+</h1>
            <div class="form-group">
              <label for="server-host">Server IP:</label>
              <input type="text" id="server-host" value="localhost" placeholder="IP Address">
            </div>
            <div class="form-group">
              <label for="server-port">Port:</label>
              <input type="number" id="server-port" value="3000" placeholder="Port">
            </div>
            <div class="form-group">
              <label for="player-name">Your Name:</label>
              <input type="text" id="player-name" placeholder="Enter your name" maxlength="20">
            </div>
            <button id="connect-btn" class="btn primary">Connect</button>
            <p id="connection-error" class="error"></p>
          </div>
        </div>

        <!-- Lobby Screen -->
        <div id="lobby-screen" class="screen">
          <div class="panel lobby-panel">
            <h2>Game Lobby</h2>
            <div id="server-info" class="server-info"></div>
            <div id="player-list" class="player-list"></div>
            <button id="start-game-btn" class="btn primary" style="display: none;">Start Game</button>
            <p class="waiting-text">Waiting for host to start...</p>
          </div>
        </div>

        <!-- Game Screen -->
        <div id="game-screen" class="screen">
          <!-- Top Bar -->
          <div id="top-bar" class="top-bar">
            <div id="round-info" class="round-info">Round 1</div>
            <div id="current-bid" class="current-bid">No bid yet</div>
            <div id="turn-indicator" class="turn-indicator"></div>
            <button id="pause-btn" class="btn pause-btn">⏸ Pause</button>
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
                <button id="bid-btn" class="btn primary">Make Bid</button>
                <button id="dudo-btn" class="btn danger">Call Dudo!</button>
                <button id="jonti-btn" class="btn warning">Call Jonti!</button>
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
    // Connection
    document.getElementById('connect-btn')?.addEventListener('click', () => {
      const host = (document.getElementById('server-host') as HTMLInputElement).value;
      const port = parseInt((document.getElementById('server-port') as HTMLInputElement).value, 10);
      const name = (document.getElementById('player-name') as HTMLInputElement).value.trim();
      
      if (!name) {
        this.showConnectionError('Please enter your name');
        return;
      }
      
      this.onConnect?.(host, port, name);
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

    // Enter key for connection
    document.getElementById('player-name')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('connect-btn')?.click();
      }
    });

    // Chat panel resize functionality
    this.setupChatResize();
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

      #game-ui * {
        pointer-events: auto;
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
        margin-bottom: 24px;
        font-size: 2.5em;
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

      .lobby-panel {
        width: 400px;
        text-align: center;
      }

      .server-info {
        background: rgba(0, 0, 0, 0.3);
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 16px;
        font-family: monospace;
      }

      .player-list {
        text-align: left;
        margin-bottom: 16px;
      }

      .player-item {
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        margin-bottom: 4px;
        display: flex;
        justify-content: space-between;
      }

      .player-item.host::after {
        content: '👑';
      }

      .waiting-text {
        color: #aaa;
        font-style: italic;
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

      .private-panel {
        transition: right 0.1s ease-out;
        position: absolute;
        bottom: 80px;
        left: 10px;
        right: 320px;
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
        right: 320px;
        background: rgba(30, 30, 50, 0.9);
        border-radius: 12px;
        padding: 16px;
      }

      .bid-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
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
        width: 300px;
        height: 350px;
        min-width: 200px;
        min-height: 150px;
        max-width: 600px;
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
    `;
    document.head.appendChild(style);
  }

  public setPlayerId(id: string): void {
    this.playerId = id;
  }

  public setIsHost(isHost: boolean): void {
    this.isHost = isHost;
    const startBtn = document.getElementById('start-game-btn');
    const waitingText = document.querySelector('.waiting-text') as HTMLElement;
    if (startBtn && waitingText) {
      startBtn.style.display = isHost ? 'block' : 'none';
      waitingText.style.display = isHost ? 'none' : 'block';
    }
  }

  public showScreen(screenId: string): void {
    document.querySelectorAll('.screen').forEach(screen => {
      screen.classList.remove('active');
    });
    document.getElementById(screenId)?.classList.add('active');
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

    // Lobby player list
    const lobbyList = document.getElementById('player-list');
    if (lobbyList && this.gameState.phase === 'lobby') {
      lobbyList.innerHTML = this.gameState.players.map(p => `
        <div class="player-item ${p.isHost ? 'host' : ''}">
          <span>${p.name}</span>
          <span>${p.isConnected ? '🟢' : '🔴'}</span>
        </div>
      `).join('');
    }

    // Game player panel
    const playersPanel = document.getElementById('players-panel');
    if (playersPanel && this.gameState.phase !== 'lobby') {
      const currentPlayer = this.gameState.players[this.gameState.currentTurnIndex];
      playersPanel.innerHTML = `
        <h3>Players</h3>
        ${this.gameState.players.map(p => `
          <div class="player-status ${p.id === currentPlayer?.id ? 'current-turn' : ''} ${p.isEliminated ? 'eliminated' : ''}">
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


  public showDudoResult(result: DudoResult): void {
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
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';
    msgEl.innerHTML = `<span class="sender">${playerName}:</span> ${message}`;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  public addSystemMessage(message: string, isCardPlay: boolean = false): void {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-message system ${isCardPlay ? 'card-play' : ''}`;
    msgEl.innerHTML = `<em>${message}</em>`;
    container.appendChild(msgEl);
    container.scrollTop = container.scrollHeight;
  }

  public showCardPlayedNotification(playerName: string, cardName: string, cardType: string, isOwnCard: boolean): void {
    // Don't show notification for own cards (they get the result modal)
    if (isOwnCard) return;

    // Get card icon based on type
    const icon = this.getCardIcon(cardType);
    
    // Show prominent notification
    this.showTemporaryNotification(
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
    document.getElementById(modalId)?.classList.add('active');
  }

  private hideModal(modalId: string): void {
    document.getElementById(modalId)?.classList.remove('active');
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
    
    this.showTemporaryNotification('⚠️', message, 'warning');
  }

  private showTemporaryNotification(icon: string, message: string, type: string = 'info'): void {
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
