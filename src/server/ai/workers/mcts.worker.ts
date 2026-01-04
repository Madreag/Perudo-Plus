// ============================================
// MCTS Worker Thread for Chuck Norris AI
// Runs heavy ISMCTS computation off the main thread
// ============================================

import { parentPort, workerData } from 'worker_threads';
import {
  AIDecision,
  AIGameContext,
  MCTSWorkerRequest,
  MCTSWorkerResponse,
  MCTSNode,
  MCTSGameState,
  OpponentModel
} from '../../../types/AI';
import { Bid, DieType, Card } from '../../../shared/types';

// MCTS Parameters
const UCB1_EXPLORATION = 0.7;

// Dice face mappings
const DICE_FACES: Record<DieType, number[]> = {
  'd3': [1, 2, 3],
  'd4': [1, 2, 3, 4],
  'd6': [1, 2, 3, 4, 5, 6],
  'd8': [1, 2, 3, 4, 5, 6, 1, 2],
  'd10': [1, 2, 3, 4, 5, 6, 1, 2, 3, 4]
};

/**
 * MCTS Engine for worker thread
 */
class MCTSEngine {
  private context: AIGameContext;
  private timeBudgetMs: number;
  private targetIterations: number;
  private opponentModels: Map<string, OpponentModel>;

  constructor(context: AIGameContext, timeBudgetMs: number, targetIterations: number) {
    this.context = context;
    this.timeBudgetMs = timeBudgetMs;
    this.targetIterations = targetIterations;
    
    // Reconstruct opponent models from serialized data
    this.opponentModels = new Map();
    if (context.opponentModels) {
      for (const [key, value] of Object.entries(context.opponentModels)) {
        this.opponentModels.set(key, value as OpponentModel);
      }
    }
  }

  /**
   * Run ISMCTS and return the best decision
   */
  public run(): { decision: AIDecision; iterations: number; timeSpentMs: number } {
    const startTime = Date.now();
    
    // Generate all possible actions
    const actions = this.generatePossibleActions();
    
    if (actions.length === 0) {
      return {
        decision: {
          action: 'dudo',
          confidence: 0.5,
          reasoning: 'No valid actions available'
        },
        iterations: 0,
        timeSpentMs: Date.now() - startTime
      };
    }

    if (actions.length === 1) {
      return {
        decision: { ...actions[0], confidence: 1.0 },
        iterations: 1,
        timeSpentMs: Date.now() - startTime
      };
    }

    // Initialize action statistics
    const actionStats = new Map<string, { wins: number; visits: number }>();
    for (const action of actions) {
      actionStats.set(this.actionKey(action), { wins: 0, visits: 0 });
    }

    let iterations = 0;
    let totalVisits = 0;

    // Main MCTS loop
    while (iterations < this.targetIterations && (Date.now() - startTime) < this.timeBudgetMs) {
      // Batch processing for efficiency
      const batchSize = 100;
      
      for (let b = 0; b < batchSize && iterations < this.targetIterations; b++) {
        // Selection using UCB1
        let bestAction = actions[0];
        let bestUCB = -Infinity;

        for (const action of actions) {
          const stats = actionStats.get(this.actionKey(action))!;
          
          if (stats.visits === 0) {
            bestAction = action;
            bestUCB = Infinity;
            break;
          }

          const exploitation = stats.wins / stats.visits;
          const exploration = UCB1_EXPLORATION * Math.sqrt(Math.log(totalVisits + 1) / stats.visits);
          const ucb = exploitation + exploration;

          if (ucb > bestUCB) {
            bestUCB = ucb;
            bestAction = action;
          }
        }

        // Determinization: Sample opponent hands
        const sampledHands = this.sampleOpponentHands();

        // Simulation
        const result = this.simulatePlayout(bestAction, sampledHands);

        // Backpropagation
        const stats = actionStats.get(this.actionKey(bestAction))!;
        stats.visits++;
        stats.wins += result;
        totalVisits++;
        iterations++;
      }

      // Check time budget
      if ((Date.now() - startTime) >= this.timeBudgetMs) {
        break;
      }
    }

    // Select best action based on visit count (more robust than win rate)
    let bestAction = actions[0];
    let bestVisits = 0;
    let bestWinRate = 0;

    for (const action of actions) {
      const stats = actionStats.get(this.actionKey(action))!;
      
      if (stats.visits > bestVisits) {
        bestVisits = stats.visits;
        bestWinRate = stats.wins / stats.visits;
        bestAction = action;
      }
    }

    const timeSpent = Date.now() - startTime;

    return {
      decision: {
        ...bestAction,
        confidence: bestWinRate,
        reasoning: `ISMCTS: ${iterations} iterations, ${(bestWinRate * 100).toFixed(1)}% win rate, ${timeSpent}ms`
      },
      iterations,
      timeSpentMs: timeSpent
    };
  }

  /**
   * Generate all possible actions
   */
  private generatePossibleActions(): AIDecision[] {
    const actions: AIDecision[] = [];
    const { currentBid, ownDice, ownCards, totalDiceCount } = this.context;

    // Opening bids
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

    // Dudo
    actions.push({ action: 'dudo', confidence: 0 });

    // Jonti
    actions.push({ action: 'jonti', confidence: 0 });

    // Valid bids
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
      const cardActions = this.generateCardActions(card);
      actions.push(...cardActions);
    }

    return actions;
  }

  /**
   * Generate card actions
   */
  private generateCardActions(card: Card): AIDecision[] {
    const actions: AIDecision[] = [];
    const { players, ownPlayerId, ownDice, currentBid } = this.context;
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
        if (currentBid) {
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

      case 'wild_shift':
        if (currentBid) {
          for (let face = 1; face <= 6; face++) {
            if (face !== currentBid.faceValue) {
              actions.push({
                action: 'play_card',
                cardPlay: {
                  cardId: card.id,
                  cardType: card.type,
                  additionalData: { newFace: face }
                },
                confidence: 0
              });
            }
          }
        }
        break;
    }

    return actions;
  }

  /**
   * Sample opponent hands based on Bayesian beliefs
   */
  private sampleOpponentHands(): Map<string, { type: DieType; faceValue: number }[]> {
    const hands = new Map<string, { type: DieType; faceValue: number }[]>();
    const { players, ownPlayerId, unknownDiceTypes, knownDice } = this.context;

    const dicePool = [...unknownDiceTypes];

    for (const player of players) {
      if (player.id === ownPlayerId || player.isEliminated) continue;

      const hand: { type: DieType; faceValue: number }[] = [];
      const model = this.opponentModels.get(player.id);

      for (let i = 0; i < player.diceCount; i++) {
        // Check known dice
        const known = knownDice.find(k => k.playerId === player.id);
        if (known && hand.length === 0) {
          hand.push({ type: known.dieType, faceValue: known.faceValue });
          continue;
        }

        // Sample from pool
        if (dicePool.length > 0) {
          const idx = Math.floor(Math.random() * dicePool.length);
          const dieType = dicePool.splice(idx, 1)[0];
          
          // Sample face with bias from opponent model
          const faceValue = this.sampleDieFaceWithBias(dieType, model);
          hand.push({ type: dieType, faceValue });
        }
      }

      hands.set(player.id, hand);
    }

    return hands;
  }

  /**
   * Sample die face with optional bias from opponent model
   */
  private sampleDieFaceWithBias(dieType: DieType, model?: OpponentModel): number {
    const possibleFaces = DICE_FACES[dieType];
    
    if (!model) {
      return possibleFaces[Math.floor(Math.random() * possibleFaces.length)];
    }

    // Apply slight bias based on opponent's face preferences
    // This simulates the belief that opponents bid on faces they have
    const weights: number[] = [];
    for (const face of possibleFaces) {
      const preference = model.facePreferences[face] || 1;
      weights.push(preference);
    }

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < possibleFaces.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return possibleFaces[i];
      }
    }

    return possibleFaces[possibleFaces.length - 1];
  }

  /**
   * Simulate a playout
   */
  private simulatePlayout(
    action: AIDecision,
    sampledHands: Map<string, { type: DieType; faceValue: number }[]>
  ): number {
    const { currentBid, ownDice, ownPlayerId, players } = this.context;

    if (action.action === 'dudo') {
      if (!currentBid) return 0.5;

      let totalCount = this.countMatchingDice(ownDice, currentBid.faceValue);
      for (const hand of sampledHands.values()) {
        totalCount += this.countMatchingDice(hand, currentBid.faceValue);
      }

      return totalCount < currentBid.quantity ? 1 : 0;
    }

    if (action.action === 'jonti') {
      if (!currentBid) return 0;

      let totalCount = this.countMatchingDice(ownDice, currentBid.faceValue);
      for (const hand of sampledHands.values()) {
        totalCount += this.countMatchingDice(hand, currentBid.faceValue);
      }

      return totalCount === currentBid.quantity ? 1 : 0;
    }

    if (action.action === 'bid' && action.bid) {
      // Deep playout simulation
      return this.simulateDeepPlayout(action.bid, sampledHands);
    }

    if (action.action === 'play_card' && action.cardPlay) {
      return this.simulateCardEffect(action.cardPlay, sampledHands);
    }

    return 0.5;
  }

  /**
   * Simulate deep playout after making a bid
   */
  private simulateDeepPlayout(
    bid: { quantity: number; faceValue: number },
    sampledHands: Map<string, { type: DieType; faceValue: number }[]>
  ): number {
    const { ownDice, players, ownPlayerId, totalDiceCount } = this.context;

    // Calculate actual count
    let actualCount = this.countMatchingDice(ownDice, bid.faceValue);
    for (const hand of sampledHands.values()) {
      actualCount += this.countMatchingDice(hand, bid.faceValue);
    }

    // Simulate opponent responses
    const activePlayers = players.filter(p => !p.isEliminated && p.id !== ownPlayerId);
    
    if (activePlayers.length === 0) {
      return actualCount >= bid.quantity ? 1 : 0;
    }

    // Simulate a few rounds of play
    let currentBid = bid;
    let depth = 0;
    const maxDepth = 5;

    while (depth < maxDepth) {
      // Each opponent decides
      for (const opponent of activePlayers) {
        const opponentModel = this.opponentModels.get(opponent.id);
        const opponentHand = sampledHands.get(opponent.id) || [];

        // Opponent's decision heuristic
        const opponentCount = this.countMatchingDice(opponentHand, currentBid.faceValue);
        const expectedTotal = opponentCount + (totalDiceCount - opponentHand.length) / 3;

        // Probability opponent calls dudo
        const bidRatio = currentBid.quantity / totalDiceCount;
        const bluffFactor = opponentModel?.bluffFrequency || 0.3;
        const dudoProb = Math.min(0.9, bidRatio * 1.5 - bluffFactor * 0.2);

        if (Math.random() < dudoProb || currentBid.quantity >= totalDiceCount) {
          // Opponent calls dudo
          return actualCount >= currentBid.quantity ? 1 : 0;
        }

        // Opponent raises
        const newQuantity = currentBid.quantity + (Math.random() < 0.5 ? 1 : 0);
        const newFace = Math.min(6, currentBid.faceValue + (Math.random() < 0.3 ? 1 : 0));
        
        if (newQuantity > totalDiceCount) {
          // Must call dudo
          return actualCount >= currentBid.quantity ? 1 : 0;
        }

        currentBid = { quantity: newQuantity, faceValue: newFace };
      }

      // Our turn again - simplified: we call dudo if bid is too high
      const ourCount = this.countMatchingDice(ownDice, currentBid.faceValue);
      const ourExpected = ourCount + (totalDiceCount - ownDice.length) / 3;

      if (currentBid.quantity > ourExpected * 1.3) {
        return actualCount < currentBid.quantity ? 1 : 0;
      }

      depth++;
    }

    // Reached max depth, evaluate position
    return actualCount >= currentBid.quantity ? 0.6 : 0.4;
  }

  /**
   * Simulate card effect
   */
  private simulateCardEffect(
    cardPlay: { cardType: string; targetPlayerId?: string },
    sampledHands: Map<string, { type: DieType; faceValue: number }[]>
  ): number {
    switch (cardPlay.cardType) {
      case 'insurance':
        return 0.65; // Safety net value
      
      case 'double_dudo':
        // High risk, high reward
        if (this.context.currentBid) {
          let totalCount = this.countMatchingDice(this.context.ownDice, this.context.currentBid.faceValue);
          for (const hand of sampledHands.values()) {
            totalCount += this.countMatchingDice(hand, this.context.currentBid.faceValue);
          }
          const success = totalCount < this.context.currentBid.quantity;
          return success ? 0.9 : 0.1;
        }
        return 0.5;
      
      case 'peek':
        return 0.6; // Information value
      
      case 'crack':
        return 0.55; // Weakening opponent
      
      case 'inflation':
        return 0.55; // Forcing opponent into harder position
      
      case 'wild_shift':
        return 0.5; // Situational
      
      case 'reroll_one':
        return 0.5; // Chance to improve
      
      case 'polish':
        return 0.55; // Upgrade value
      
      default:
        return 0.5;
    }
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
   * Create unique action key
   */
  private actionKey(action: AIDecision): string {
    if (action.action === 'bid' && action.bid) {
      return `bid_${action.bid.quantity}_${action.bid.faceValue}`;
    }
    if (action.action === 'play_card' && action.cardPlay) {
      const data = action.cardPlay.additionalData ? JSON.stringify(action.cardPlay.additionalData) : '';
      return `card_${action.cardPlay.cardType}_${action.cardPlay.targetPlayerId || ''}_${action.cardPlay.targetDieId || ''}_${data}`;
    }
    return action.action;
  }
}

// Worker message handler
if (parentPort) {
  parentPort.on('message', (request: MCTSWorkerRequest) => {
    if (request.type === 'compute') {
      try {
        const engine = new MCTSEngine(
          request.context,
          request.timeBudgetMs,
          request.targetIterations
        );

        const result = engine.run();

        const response: MCTSWorkerResponse = {
          type: 'result',
          decision: result.decision,
          iterations: result.iterations,
          timeSpentMs: result.timeSpentMs
        };

        parentPort!.postMessage(response);
      } catch (error) {
        console.error('[MCTS Worker] Error:', error);
        
        // Send fallback response
        const response: MCTSWorkerResponse = {
          type: 'result',
          decision: {
            action: 'dudo',
            confidence: 0.5,
            reasoning: 'Worker error fallback'
          },
          iterations: 0,
          timeSpentMs: 0
        };

        parentPort!.postMessage(response);
      }
    }
  });

  console.log('[MCTS Worker] Ready');
}

export { MCTSEngine };
