// ============================================
// Perudo+ AI Types and Interfaces
// ============================================

import { DieType, Die, Card, Bid, CardType } from '../shared/types';

// AI Difficulty Levels
export enum AIDifficulty {
  EASY = 'easy',           // "The Town Drunk" - Stochastic
  NORMAL = 'normal',       // "The Casual" - Heuristic
  HARD = 'hard',           // "The Mathematician" - Exact PBD + Bayesian
  CHUCK_NORRIS = 'chuck_norris'  // "The Solver" - ISMCTS with Worker Threads
}

// AI Difficulty Display Names
export const AI_DIFFICULTY_NAMES: Record<AIDifficulty, string> = {
  [AIDifficulty.EASY]: 'Easy (The Town Drunk)',
  [AIDifficulty.NORMAL]: 'Normal (The Casual)',
  [AIDifficulty.HARD]: 'Hard (The Mathematician)',
  [AIDifficulty.CHUCK_NORRIS]: 'Chuck Norris (The Solver)'
};

// AI Difficulty Descriptions
export const AI_DIFFICULTY_DESCRIPTIONS: Record<AIDifficulty, string> = {
  [AIDifficulty.EASY]: 'Makes random decisions with occasional hand-based bids. Uses cards randomly.',
  [AIDifficulty.NORMAL]: 'Uses simple heuristics assuming all dice are d6. Reactive card usage.',
  [AIDifficulty.HARD]: 'Calculates exact probabilities with Poisson Binomial Distribution. Tracks opponent patterns.',
  [AIDifficulty.CHUCK_NORRIS]: 'Uses Monte Carlo Tree Search for near-optimal play. Heavy computation with worker threads.'
};

// AI Action Types
export type AIActionType = 'bid' | 'dudo' | 'calza' | 'jonti' | 'late_dudo' | 'play_card';

// Shared type for card play actions (used by both AI and game execution)
export interface AICardPlay {
  cardId: string;
  cardType: CardType;
  targetPlayerId?: string;
  targetDieId?: string;
  additionalData?: {
    faceValue?: number;      // For wild_shift
    dieIds?: string[];       // For gauge
    claimedFace?: number;    // For false_tell
    claimedType?: string;    // For false_tell
    dieIndex?: number;       // Alternative die targeting
    [key: string]: any;      // Allow other custom data
  };
}

// AI Decision Result
export interface AIDecision {
  action: AIActionType;
  bid?: {
    quantity: number;
    faceValue: number;
  };
  cardPlay?: AICardPlay;
  confidence: number;  // 0-1 confidence in the decision
  reasoning?: string;  // Optional explanation for debugging
}

// Opponent Model for tracking behavior
export interface OpponentModel {
  playerId: string;
  bidHistory: BidHistoryEntry[];
  bluffFrequency: number;      // Estimated bluff rate 0-1
  aggressiveness: number;      // How often they raise vs call 0-1
  facePreferences: number[];   // Weights for faces 1-6
  lastUpdated: number;
}

export interface BidHistoryEntry {
  bid: Bid;
  wasBluff: boolean | null;    // null if unknown (round not resolved)
  roundNumber: number;
  totalDiceInPlay: number;
}

// Known dice information (from Peek cards, etc.)
export interface KnownDiceInfo {
  playerId: string;
  dieId: string;
  dieType: DieType;
  faceValue: number;
  roundNumber: number;  // When this info was obtained
}

// Game mode type (imported from shared types)
export type GameMode = 'classic' | 'tactical' | 'chaos';

// AI Game Context - all information available to AI
export interface AIGameContext {
  // Own information
  ownDice: Die[];
  ownCards: Card[];
  ownPlayerId: string;
  
  // Game state
  currentBid: Bid | null;
  previousBids: Bid[];
  roundNumber: number;
  gameMode: GameMode;  // Current game mode for strategy adjustment
  
  // Other players (public info)
  players: AIPlayerInfo[];
  currentTurnPlayerId: string;
  
  // Total dice in play
  totalDiceCount: number;
  unknownDiceTypes: DieType[];  // Types of dice we don't know the values of
  
  // Known information from cards
  knownDice: KnownDiceInfo[];
  
  // Opponent models (for Hard/Chuck Norris)
  opponentModels: Map<string, OpponentModel>;
}

export interface AIPlayerInfo {
  id: string;
  name: string;
  diceCount: number;
  cardCount: number;
  isEliminated: boolean;
  slot: number | null;
}

// Probability calculation result
export interface ProbabilityResult {
  probability: number;
  expectedCount: number;
  variance: number;
}

// MCTS Node for Chuck Norris AI
export interface MCTSNode {
  state: MCTSGameState;
  parent: MCTSNode | null;
  children: MCTSNode[];
  action: AIDecision | null;
  visits: number;
  wins: number;
  untriedActions: AIDecision[];
}

export interface MCTSGameState {
  // Simplified game state for simulation
  playerDice: Map<string, Die[]>;
  currentBid: Bid | null;
  currentPlayerIndex: number;
  playerOrder: string[];
  isTerminal: boolean;
  winner: string | null;
}

// Worker thread message types
export interface MCTSWorkerRequest {
  type: 'compute';
  context: AIGameContext;
  timeBudgetMs: number;
  targetIterations: number;
}

export interface MCTSWorkerResponse {
  type: 'result';
  decision: AIDecision;
  iterations: number;
  timeSpentMs: number;
}

// Strategy interface that all AI strategies must implement
export interface AIStrategy {
  readonly difficulty: AIDifficulty;
  readonly name: string;
  
  /**
   * Make a decision based on the current game context
   * @param context The current game state from AI's perspective
   * @returns Promise resolving to the AI's decision
   */
  makeDecision(context: AIGameContext): Promise<AIDecision>;
  
  /**
   * Update opponent models after a round ends
   * @param context The game context with round results
   */
  updateModels?(context: AIGameContext, dudoResult?: any): void;
  
  /**
   * Reset the strategy state for a new game
   */
  reset(): void;
}

// Dice probability distribution
export interface DiceProbabilities {
  dieType: DieType;
  faceProbabilities: number[];  // Index 0 = face 1, etc.
}

// Cache key for probability calculations
export interface ProbabilityCacheKey {
  diceTypes: string;  // Serialized dice types
  targetFace: number;
  quantityNeeded: number;
}
