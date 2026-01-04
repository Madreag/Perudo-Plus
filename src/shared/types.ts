// ============================================
// Perudo+ Shared Types and Interfaces
// ============================================

// Dice Types
export type DieType = 'd3' | 'd4' | 'd6' | 'd8' | 'd10';

export interface Die {
  id: string;
  type: DieType;
  faceValue: number; // 1-6 after normalization
}

// Card Types
export type CardType = 
  // Information Cards
  | 'peek' 
  | 'gauge' 
  | 'false_tell'
  // Bid Manipulation Cards
  | 'inflation' 
  | 'wild_shift' 
  | 'phantom_bid'
  // Dudo Interaction Cards
  | 'insurance' 
  | 'double_dudo' 
  | 'late_dudo'
  // Dice Manipulation Cards
  | 'reroll_one' 
  | 'blind_swap' 
  | 'polish' 
  | 'crack';

export type CardTiming = 'on_turn' | 'reaction' | 'on_dudo' | 'any';

// Active card effects on a player
export interface ActiveEffects {
  insurance: boolean;      // Next failed dudo doesn't cost a die
  doubleDudo: boolean;     // Next dudo has double stakes
  phantomBid: boolean;     // Next bid can ignore increment rules
  lateDudo: boolean;       // Can call dudo on previous bid
}

export interface Card {
  id: string;
  type: CardType;
  name: string;
  description: string;
  timing: CardTiming;
}

// Player
export interface Player {
  id: string;
  name: string;
  ip: string;
  slot: number | null; // null = unassigned, 0-based slot index
  dice: Die[];
  cards: Card[];
  isConnected: boolean;
  isHost: boolean;
  isEliminated: boolean;
  isAI: boolean;
  activeEffects: ActiveEffects;
}

// Public player info (visible to other players)
export interface PublicPlayerInfo {
  id: string;
  name: string;
  ip: string;
  slot: number | null;
  diceCount: number;
  cardCount: number;
  isConnected: boolean;
  isHost: boolean;
  isEliminated: boolean;
  isAI: boolean;
  activeEffects: ActiveEffects;
}

// Bid
export interface Bid {
  playerId: string;
  quantity: number;
  faceValue: number; // 1-6
}

// Game Phase
export type GamePhase = 
  | 'lobby' 
  | 'rolling' 
  | 'bidding' 
  | 'dudo_called' 
  | 'round_end' 
  | 'game_over'
  | 'paused';

// Game Mode
export type GameMode = 'classic' | 'tactical' | 'chaos';

// Stage/Scene Type
export type StageType = 'casino' | 'dungeon' | 'beach';

// AI Difficulty Level
export type AIDifficulty = 'easy' | 'normal' | 'hard' | 'chuck_norris';



// Game Settings
export interface GameSettings {
  mode: GameMode;
  stage: StageType;
  maxPlayers: number;
  enableCalza: boolean;
  enableLastStand: boolean;
  aiDifficulty: AIDifficulty;
  aiPlayerCount: number;
}

// Game State
export interface GameState {
  id: string;
  phase: GamePhase;
  settings: GameSettings;
  players: Player[];
  currentTurnIndex: number;
  currentBid: Bid | null;
  previousBids: Bid[];
  roundNumber: number;
  winnerId: string | null;
  lastDudoResult: DudoResult | null;
  pausedFromPhase: GamePhase | null;
}

// Public game state (sent to clients)
export interface PublicGameState {
  id: string;
  phase: GamePhase;
  settings: GameSettings;
  players: PublicPlayerInfo[];
  currentTurnIndex: number;
  currentBid: Bid | null;
  previousBids: Bid[];
  roundNumber: number;
  winnerId: string | null;
  lastDudoResult: DudoResult | null;
  pausedFromPhase: GamePhase | null;
}

// Dudo Result
export interface DudoResult {
  callerId: string;
  targetPlayerId: string;
  bid: Bid;
  actualCount: number;
  success: boolean; // true if caller was correct (bid was a bluff)
  loserId: string;
  revealedDice: { playerId: string; dice: Die[] }[];
}

// Jonti Result
export interface JontiResult {
  callerId: string;
  bid: Bid;
  actualCount: number;
  success: boolean; // true if bid was exactly correct (caller gains a die)
  revealedDice: { playerId: string; dice: Die[] }[];
}

// ============================================
// Network Messages
// ============================================


// Specific message payloads
export interface JoinGamePayload {
  playerName: string;
}

export interface MakeBidPayload {
  quantity: number;
  faceValue: number;
}

export interface PlayCardPayload {
  cardId: string;
  targetPlayerId?: string;
  targetDieId?: string;
  additionalData?: any;
}

export interface PrivateInfoPayload {
  dice: Die[];
  cards: Card[];
}

export interface ServerInfoPayload {
  publicIp: string;
  port: number;
  playerCount: number;
  maxPlayers: number;
}

export interface ErrorPayload {
  message: string;
  code: string;
}

// ============================================
// Session Management Types
// ============================================

export interface SessionInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
  mode: GameMode;
  stage: StageType;
  createdAt: number;
}

export interface SessionListPayload {
  sessions: SessionInfo[];
  previousSessionId: string | null; // Session the player was in before disconnect
}

// Browser player info (for session browser)
export interface BrowserPlayerInfo {
  identityId: string;
  playerName: string;
}

export interface BrowserChatPayload {
  message: string;
}

export interface CreateSessionPayload {
  sessionName: string;
  hostName: string;
  settings?: Partial<GameSettings>;
}

export interface JoinSessionPayload {
  sessionId: string;
  playerName: string;
}

export interface UpdateSessionSettingsPayload {
  mode?: GameMode;
  stage?: StageType;
  maxPlayers?: number;
  aiDifficulty?: AIDifficulty;
  aiPlayerCount?: number;
}

// Extended client message types to include session management
export type ClientMessageType = 
  | 'register'           // Register with the server (get player identity)
  | 'list_sessions'      // Request session list
  | 'create_session'     // Create a new game session
  | 'join_session'       // Join an existing session
  | 'leave_session'      // Leave current session (back to browser)
  | 'update_session_settings' // Update session settings (host only)
  | 'delete_session'     // Delete the session (host only)
  | 'browser_chat'       // Chat message in session browser
  | 'join_game'
  | 'start_game'
  | 'make_bid'
  | 'call_dudo'
  | 'call_calza'
  | 'call_jonti'
  | 'play_card'
  | 'ready_for_round'
  | 'chat'
  | 'new_game'
  | 'pause_game'
  | 'resume_game'
  | 'kick_player'
  | 'select_slot'
  | 'add_ai_player'
  | 'remove_ai_player';

// Extended server message types
export type ServerMessageType = 
  | 'registered'          // Player registered with server
  | 'sessions_list'       // List of available sessions
  | 'session_created'     // Session was created successfully
  | 'session_joined'      // Successfully joined a session
  | 'session_left'        // Left the session
  | 'session_updated'     // Session info updated (for browser refresh)
  | 'session_settings_updated' // Session settings changed by host
  | 'session_deleted'     // Session was deleted by host
  | 'browser_players_list' // List of players in session browser
  | 'browser_chat'        // Chat message in session browser
  | 'connection_accepted'
  | 'player_joined'
  | 'player_left'
  | 'game_started'
  | 'game_state_update'
  | 'private_info'
  | 'dice_rolled'
  | 'bid_made'
  | 'dudo_called'
  | 'dudo_result'
  | 'jonti_called'
  | 'jonti_result'
  | 'round_started'
  | 'round_ended'
  | 'game_over'
  | 'card_played'
  | 'card_drawn'
  | 'player_drew_card'
  | 'error'
  | 'chat'
  | 'server_info'
  | 'game_paused'
  | 'game_resumed'
  | 'player_kicked';

export interface ClientMessage {
  type: ClientMessageType;
  payload: any;
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: any;
}
