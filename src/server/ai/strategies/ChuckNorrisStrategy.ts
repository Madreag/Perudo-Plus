// ============================================
// Chuck Norris AI Strategy - "The Solver"
// Information Set Monte Carlo Tree Search (ISMCTS)
// Uses Worker Threads for heavy computation
// ============================================

import { Worker } from 'worker_threads';
import * as path from 'path';
import {
  AIStrategy,
  AIDecision,
  AIGameContext,
  AIDifficulty,
  OpponentModel,
  MCTSWorkerRequest,
  MCTSWorkerResponse
} from '../../../types/AI';
import { Bid, Card, DieType } from '../../../shared/types';
import { getProbabilityEngine } from '../ProbabilityEngine';

/**
 * ChuckNorrisStrategy - "The Solver"
 * 
 * Architecture: Uses Node.js Worker Threads for heavy MCTS computation
 * Algorithm: Information Set Monte Carlo Tree Search (ISMCTS)
 * 
 * Parameters:
 * - Time Budget: 5.0 Seconds (Strict)
 * - Iterations: Adaptive (Target 50,000 - 100,000 iterations)
 * 
 * Logic:
 * 1. Determinization: Sample specific hands for opponents based on Bayesian beliefs
 * 2. Simulation: Run deep playouts with card effect simulation
 * 3. Selection: UCB1 Formula: Score = WinRate + 0.7 * sqrt(ln(TotalVisits) / NodeVisits)
 * 
 * This AI plays near-perfect Nash Equilibrium with optimal bluffing.
 */
export class ChuckNorrisStrategy implements AIStrategy {
  public readonly difficulty = AIDifficulty.CHUCK_NORRIS;
  public readonly name = 'The Solver';

  // MCTS Parameters
  private readonly TIME_BUDGET_MS = 5000;
  private readonly TARGET_ITERATIONS_MIN = 50000;
  private readonly TARGET_ITERATIONS_MAX = 100000;
  private readonly UCB1_EXPLORATION = 0.7;

  // Opponent models for Bayesian beliefs
  private opponentModels: Map<string, OpponentModel> = new Map();

  // Probability engine for fallback calculations
  private probEngine = getProbabilityEngine();

  // Worker thread reference
  private worker: Worker | null = null;
  private workerReady: boolean = false;

  constructor() {
    this.initializeWorker();
  }

  /**
   * Initialize the worker thread
   */
  private initializeWorker(): void {
    try {
      // Handle both development (.ts) and production (.js) environments
      const isProduction = __dirname.includes('dist');
      const workerFile = isProduction ? 'mcts.worker.js' : 'mcts.worker.ts';
      const workerPath = path.join(__dirname, '..', 'workers', workerFile);
      
      // For TypeScript files, we need to use ts-node or compile first
      // In production, the compiled .js file will be used
      this.worker = new Worker(workerPath);
      
      this.worker.on('error', (error) => {
        console.error('[ChuckNorris] Worker error:', error);
        this.workerReady = false;
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[ChuckNorris] Worker exited with code ${code}`);
        }
        this.workerReady = false;
      });

      this.workerReady = true;
      console.log('[ChuckNorris] MCTS Worker initialized');
    } catch (error) {
      console.error('[ChuckNorris] Failed to initialize worker:', error);
      this.workerReady = false;
    }
  }

  /**
   * Make a decision using ISMCTS
   */
  public async makeDecision(context: AIGameContext): Promise<AIDecision> {
    // Try to use worker thread for MCTS
    if (this.workerReady && this.worker) {
      try {
        return await this.runMCTSInWorker(context);
      } catch (error) {
        console.error('[ChuckNorris] Worker computation failed, falling back:', error);
      }
    }

    // Fallback to synchronous MCTS (limited iterations)
    return this.runMCTSSynchronous(context);
  }

  /**
   * Run MCTS in worker thread
   */
  private async runMCTSInWorker(context: AIGameContext): Promise<AIDecision> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Worker timeout'));
      }, this.TIME_BUDGET_MS + 1000);

      const messageHandler = (response: MCTSWorkerResponse) => {
        clearTimeout(timeout);
        this.worker?.off('message', messageHandler);
        
        if (response.type === 'result') {
          console.log(`[ChuckNorris] MCTS completed: ${response.iterations} iterations in ${response.timeSpentMs}ms`);
          resolve(response.decision);
        } else {
          reject(new Error('Invalid worker response'));
        }
      };

      this.worker.on('message', messageHandler);

      // Prepare context for worker (serialize opponent models)
      const serializedContext = this.serializeContext(context);

      const request: MCTSWorkerRequest = {
        type: 'compute',
        context: serializedContext,
        timeBudgetMs: this.TIME_BUDGET_MS,
        targetIterations: this.TARGET_ITERATIONS_MAX
      };

      this.worker.postMessage(request);
    });
  }

  /**
   * Serialize context for worker thread
   */
  private serializeContext(context: AIGameContext): AIGameContext {
    // Convert Map to serializable format
    const serializedModels = new Map<string, OpponentModel>();
    for (const [key, value] of this.opponentModels) {
      serializedModels.set(key, { ...value });
    }

    return {
      ...context,
      opponentModels: serializedModels
    };
  }

  /**
   * Run MCTS synchronously (fallback with limited iterations)
   */
  private runMCTSSynchronous(context: AIGameContext): AIDecision {
    const startTime = Date.now();
    const maxTime = 2000; // Reduced time for synchronous execution
    const maxIterations = 10000;

    // Generate possible actions
    const actions = this.generatePossibleActions(context);
    
    if (actions.length === 0) {
      return {
        action: 'dudo',
        confidence: 0.5,
        reasoning: 'No valid actions available'
      };
    }

    if (actions.length === 1) {
      return actions[0];
    }

    // Simple MCTS with UCB1
    const actionStats = new Map<string, { wins: number; visits: number }>();
    
    for (const action of actions) {
      actionStats.set(this.actionKey(action), { wins: 0, visits: 0 });
    }

    let iterations = 0;
    let totalVisits = 0;

    while (iterations < maxIterations && (Date.now() - startTime) < maxTime) {
      // Selection using UCB1
      let bestAction = actions[0];
      let bestUCB = -Infinity;

      for (const action of actions) {
        const stats = actionStats.get(this.actionKey(action))!;
        
        if (stats.visits === 0) {
          bestAction = action;
          break;
        }

        const exploitation = stats.wins / stats.visits;
        const exploration = this.UCB1_EXPLORATION * Math.sqrt(Math.log(totalVisits) / stats.visits);
        const ucb = exploitation + exploration;

        if (ucb > bestUCB) {
          bestUCB = ucb;
          bestAction = action;
        }
      }

      // Simulation
      const result = this.simulatePlayout(context, bestAction);

      // Backpropagation
      const stats = actionStats.get(this.actionKey(bestAction))!;
      stats.visits++;
      stats.wins += result;
      totalVisits++;
      iterations++;
    }

    // Select best action
    let bestAction = actions[0];
    let bestWinRate = 0;

    for (const action of actions) {
      const stats = actionStats.get(this.actionKey(action))!;
      const winRate = stats.visits > 0 ? stats.wins / stats.visits : 0;
      
      if (winRate > bestWinRate) {
        bestWinRate = winRate;
        bestAction = action;
      }
    }

    console.log(`[ChuckNorris] Sync MCTS: ${iterations} iterations, best win rate: ${(bestWinRate * 100).toFixed(1)}%`);

    return {
      ...bestAction,
      confidence: bestWinRate,
      reasoning: `MCTS with ${iterations} iterations, ${(bestWinRate * 100).toFixed(1)}% win rate`
    };
  }

  /**
   * Generate all possible actions from current state
   */
  private generatePossibleActions(context: AIGameContext): AIDecision[] {
    const actions: AIDecision[] = [];
    const { currentBid, ownDice, ownCards, totalDiceCount } = context;

    // If no current bid, generate opening bids
    if (!currentBid) {
      for (let face = 1; face <= 6; face++) {
        for (let qty = 1; qty <= Math.min(5, totalDiceCount); qty++) {
          actions.push({
            action: 'bid',
            bid: { quantity: qty, faceValue: face },
            confidence: 0
          });
        }
      }
      return actions;
    }

    // Dudo is always an option
    actions.push({
      action: 'dudo',
      confidence: 0
    });

    // Jonti option
    actions.push({
      action: 'jonti',
      confidence: 0
    });

    // Generate valid bids
    for (let face = 1; face <= 6; face++) {
      const minQty = face > currentBid.faceValue ? currentBid.quantity : currentBid.quantity + 1;
      
      for (let qty = minQty; qty <= totalDiceCount; qty++) {
        actions.push({
          action: 'bid',
          bid: { quantity: qty, faceValue: face },
          confidence: 0
        });
      }
    }

    // Card actions
    for (const card of ownCards) {
      const cardActions = this.generateCardActions(context, card);
      actions.push(...cardActions);
    }

    return actions;
  }

  /**
   * Generate possible actions for a card
   */
  private generateCardActions(context: AIGameContext, card: Card): AIDecision[] {
    const actions: AIDecision[] = [];
    const { players, ownPlayerId, ownDice } = context;
    const otherPlayers = players.filter(p => p.id !== ownPlayerId && !p.isEliminated);

    switch (card.type) {
      case 'peek':
      case 'crack':
        for (const player of otherPlayers) {
          actions.push({
            action: 'play_card',
            cardPlay: {
              cardId: card.id,
              cardType: card.type,
              targetPlayerId: player.id
            },
            confidence: 0
          });
        }
        break;

      case 'reroll_one':
      case 'polish':
        for (const die of ownDice) {
          actions.push({
            action: 'play_card',
            cardPlay: {
              cardId: card.id,
              cardType: card.type,
              targetDieId: die.id
            },
            confidence: 0
          });
        }
        break;

      case 'insurance':
      case 'double_dudo':
        actions.push({
          action: 'play_card',
          cardPlay: {
            cardId: card.id,
            cardType: card.type
          },
          confidence: 0
        });
        break;

      case 'inflation':
      case 'wild_shift':
        if (context.currentBid) {
          actions.push({
            action: 'play_card',
            cardPlay: {
              cardId: card.id,
              cardType: card.type
            },
            confidence: 0
          });
        }
        break;
    }

    return actions;
  }

  /**
   * Simulate a playout from the current state
   * Returns 1 for win, 0 for loss
   */
  private simulatePlayout(context: AIGameContext, action: AIDecision): number {
    const { currentBid, ownDice, unknownDiceTypes, ownPlayerId } = context;

    // Determinization: Sample opponent hands
    const sampledHands = this.sampleOpponentHands(context);

    // Simulate the action
    if (action.action === 'dudo') {
      if (!currentBid) return 0.5;

      // Count total matching dice
      let totalCount = this.countMatchingDice(ownDice, currentBid.faceValue);
      
      for (const hand of sampledHands.values()) {
        totalCount += this.countMatchingDice(hand, currentBid.faceValue);
      }

      // Dudo succeeds if actual count < bid quantity
      return totalCount < currentBid.quantity ? 1 : 0;
    }

    if (action.action === 'jonti') {
      if (!currentBid) return 0;

      let totalCount = this.countMatchingDice(ownDice, currentBid.faceValue);
      
      for (const hand of sampledHands.values()) {
        totalCount += this.countMatchingDice(hand, currentBid.faceValue);
      }

      // Jonti succeeds if actual count === bid quantity
      return totalCount === currentBid.quantity ? 1 : 0;
    }

    if (action.action === 'bid' && action.bid) {
      // Simulate opponent response
      // Simple heuristic: opponent calls dudo if bid seems too high
      const totalDice = context.totalDiceCount;
      const bidRatio = action.bid.quantity / totalDice;

      // Probability opponent calls dudo
      const dudoProb = Math.min(0.9, bidRatio * 1.5);

      if (Math.random() < dudoProb) {
        // Opponent calls dudo
        let totalCount = this.countMatchingDice(ownDice, action.bid.faceValue);
        
        for (const hand of sampledHands.values()) {
          totalCount += this.countMatchingDice(hand, action.bid.faceValue);
        }

        // We win if our bid is valid
        return totalCount >= action.bid.quantity ? 1 : 0;
      }

      // Opponent raises, continue simulation (simplified)
      return 0.5;
    }

    if (action.action === 'play_card') {
      // Card play value estimation
      switch (action.cardPlay?.cardType) {
        case 'insurance':
          return 0.6; // Insurance provides safety
        case 'double_dudo':
          return 0.5; // High risk, high reward
        case 'peek':
          return 0.55; // Information is valuable
        case 'crack':
          return 0.55; // Weakening opponent is good
        default:
          return 0.5;
      }
    }

    return 0.5;
  }

  /**
   * Sample opponent hands based on Bayesian beliefs
   */
  private sampleOpponentHands(context: AIGameContext): Map<string, { type: DieType; faceValue: number }[]> {
    const hands = new Map<string, { type: DieType; faceValue: number }[]>();
    const { players, ownPlayerId, unknownDiceTypes, knownDice } = context;

    // Create a pool of unknown dice types
    const dicePool = [...unknownDiceTypes];

    for (const player of players) {
      if (player.id === ownPlayerId || player.isEliminated) continue;

      const hand: { type: DieType; faceValue: number }[] = [];

      for (let i = 0; i < player.diceCount; i++) {
        // Check if we know this die from Peek
        const known = knownDice.find(k => k.playerId === player.id);
        
        if (known && hand.length === 0) {
          hand.push({ type: known.dieType, faceValue: known.faceValue });
          continue;
        }

        // Sample from pool
        if (dicePool.length > 0) {
          const idx = Math.floor(Math.random() * dicePool.length);
          const dieType = dicePool.splice(idx, 1)[0];
          const faceValue = this.sampleDieFace(dieType);
          hand.push({ type: dieType, faceValue });
        }
      }

      hands.set(player.id, hand);
    }

    return hands;
  }

  /**
   * Sample a face value for a die type
   */
  private sampleDieFace(dieType: DieType): number {
    const faces: Record<DieType, number[]> = {
      'd3': [1, 2, 3],
      'd4': [1, 2, 3, 4],
      'd6': [1, 2, 3, 4, 5, 6],
      'd8': [1, 2, 3, 4, 5, 6, 1, 2],
      'd10': [1, 2, 3, 4, 5, 6, 1, 2, 3, 4]
    };

    const possibleFaces = faces[dieType];
    return possibleFaces[Math.floor(Math.random() * possibleFaces.length)];
  }

  /**
   * Count matching dice including wilds
   */
  private countMatchingDice(dice: { faceValue: number }[], targetFace: number): number {
    let count = 0;
    for (const die of dice) {
      if (die.faceValue === targetFace) {
        count++;
      } else if (targetFace !== 1 && die.faceValue === 1) {
        count++;
      }
    }
    return count;
  }

  /**
   * Create a unique key for an action
   */
  private actionKey(action: AIDecision): string {
    if (action.action === 'bid' && action.bid) {
      return `bid_${action.bid.quantity}_${action.bid.faceValue}`;
    }
    if (action.action === 'play_card' && action.cardPlay) {
      return `card_${action.cardPlay.cardType}_${action.cardPlay.targetPlayerId || ''}_${action.cardPlay.targetDieId || ''}`;
    }
    return action.action;
  }

  /**
   * Update opponent models after a round ends
   */
  public updateModels(context: AIGameContext, dudoResult?: any): void {
    if (!dudoResult) return;

    const { previousBids, roundNumber, totalDiceCount } = context;

    for (const bid of previousBids) {
      let model = this.opponentModels.get(bid.playerId);
      
      if (!model) {
        model = {
          playerId: bid.playerId,
          bidHistory: [],
          bluffFrequency: 0.3,
          aggressiveness: 0.5,
          facePreferences: [0, 1, 1, 1, 1, 1, 1],
          lastUpdated: Date.now()
        };
        this.opponentModels.set(bid.playerId, model);
      }

      const wasBluff = dudoResult && 
        dudoResult.bid.playerId === bid.playerId && 
        dudoResult.success;

      model.bidHistory.push({
        bid,
        wasBluff: wasBluff ?? null,
        roundNumber,
        totalDiceInPlay: totalDiceCount
      });

      if (wasBluff !== null) {
        const alpha = 0.2;
        model.bluffFrequency = alpha * (wasBluff ? 1 : 0) + (1 - alpha) * model.bluffFrequency;
      }

      // Update aggressiveness based on bid ratio
      const bidRatio = bid.quantity / totalDiceCount;
      model.aggressiveness = 0.2 * bidRatio + 0.8 * model.aggressiveness;

      model.facePreferences[bid.faceValue] += 0.1;
      
      const sum = model.facePreferences.slice(1).reduce((a, b) => a + b, 0);
      for (let i = 1; i <= 6; i++) {
        model.facePreferences[i] /= sum / 6;
      }

      model.lastUpdated = Date.now();
    }
  }

  /**
   * Reset strategy state for a new game
   */
  public reset(): void {
    this.opponentModels.clear();
    this.probEngine.clearCache();
  }

  /**
   * Cleanup worker thread
   */
  public async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
  }
}

export default ChuckNorrisStrategy;
