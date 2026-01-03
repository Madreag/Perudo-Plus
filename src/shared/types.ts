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
  dice: Die[];
  cards: Card[];
  isConnected: boolean;
  isHost: boolean;
  isEliminated: boolean;
  activeEffects: ActiveEffects;
}

// Public player info (visible to other players)
export interface PublicPlayerInfo {
  id: string;
  name: string;
  diceCount: number;
  cardCount: number;
  isConnected: boolean;
  isHost: boolean;
  isEliminated: boolean;
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

// Game Settings
export interface GameSettings {
  mode: GameMode;
  maxPlayers: number;
  enableCalza: boolean;
  enableLastStand: boolean;
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

export type ClientMessageType = 
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
  | 'resume_game';

export type ServerMessageType = 
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
  | 'error'
  | 'chat'
  | 'server_info'
  | 'game_paused'
  | 'game_resumed';

export interface ClientMessage {
  type: ClientMessageType;
  payload: any;
}

export interface ServerMessage {
  type: ServerMessageType;
  payload: any;
}

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
