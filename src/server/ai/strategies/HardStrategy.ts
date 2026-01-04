// ============================================
// Hard AI Strategy - "The Mathematician"
// Exact PBD Calculation + Bayesian Opponent Modeling
// ============================================

import {
  AIStrategy,
  AIDecision,
  AIGameContext,
  AIDifficulty,
  OpponentModel,
  BidHistoryEntry
} from '../../../types/AI';
import { Bid, Card, DieType } from '../../../shared/types';
import { getProbabilityEngine } from '../ProbabilityEngine';

/**
 * HardStrategy - "The Mathematician"
 * 
 * Logic:
 * - Exact PBD Calculation using the ProbabilityEngine
 * - Bayesian Opponent Modeling: Track opponent bid history
 * - Thresholds:
 *   - Bid if P(Safe) > 45%
 *   - Dudo if P(Success) > 55%
 *   - Jonti if P(Exact) > 25%
 * - Cards: Value-based (EV). Play 'Peek' early; play 'Inflation' to force opponents into low-probability bids
 */
export class HardStrategy implements AIStrategy {
  public readonly difficulty = AIDifficulty.HARD;
  public readonly name = 'The Mathematician';

  // Decision thresholds
  private readonly BID_SAFE_THRESHOLD = 0.45;
  private readonly DUDO_SUCCESS_THRESHOLD = 0.55;
  private readonly JONTI_EXACT_THRESHOLD = 0.25;

  // Opponent models
  private opponentModels: Map<string, OpponentModel> = new Map();

  // Probability engine
  private probEngine = getProbabilityEngine();

  /**
   * Make a decision based on exact probability calculations
   */
  public async makeDecision(context: AIGameContext): Promise<AIDecision> {
    const { currentBid, ownDice, ownCards, totalDiceCount, unknownDiceTypes, gameMode } = context;

    // Consider playing a card first (skip in Classic mode)
    if (gameMode !== 'classic') {
      const cardDecision = this.considerCardPlay(context);
      if (cardDecision) {
        return cardDecision;
      }
    }

    // If no current bid, make an opening bid
    if (!currentBid) {
      return this.makeOpeningBid(context);
    }

    // Calculate probabilities for current bid
    const bidProb = this.probEngine.calculateBidProbability(
      ownDice.map(d => ({ type: d.type, faceValue: d.faceValue })),
      unknownDiceTypes,
      currentBid.quantity,
      currentBid.faceValue
    );

    // Calculate exact probability for Jonti
    const exactProb = this.probEngine.calculateExactProbability(
      ownDice.map(d => ({ type: d.type, faceValue: d.faceValue })),
      unknownDiceTypes,
      currentBid.quantity,
      currentBid.faceValue
    );

    // Adjust probabilities based on opponent models
    const adjustedBidProb = this.adjustProbabilityWithOpponentModel(
      bidProb,
      context,
      currentBid
    );

    // Decision logic
    // 1. Consider Jonti if exact probability is high enough (dynamic threshold)
    const dynamicJontiThreshold = this.calculateDynamicJontiThreshold(context);
    if (exactProb > dynamicJontiThreshold) {
      return {
        action: 'jonti',
        confidence: exactProb,
        reasoning: `Jonti with ${(exactProb * 100).toFixed(1)}% exact probability (threshold: ${(dynamicJontiThreshold * 100).toFixed(1)}%)`
      };
    }

    // 2. Consider Dudo if bid probability is low
    if (adjustedBidProb < (1 - this.DUDO_SUCCESS_THRESHOLD)) {
      return this.considerDudo(context, adjustedBidProb, ownCards);
    }

    // 3. Make a calculated bid
    return this.makeCalculatedBid(context, currentBid);
  }

  /**
   * Make an opening bid based on probability calculations
   */
  private makeOpeningBid(context: AIGameContext): AIDecision {
    const { ownDice, unknownDiceTypes, totalDiceCount } = context;

    // Count our dice by face value
    const faceCounts = this.countOwnDice(ownDice);

    // Find the best face to bid on
    let bestFace = 2;
    let bestExpected = 0;
    let bestProb = 0;

    for (let face = 2; face <= 6; face++) {
      const ownCount = faceCounts[face] + faceCounts[1]; // Include wilds
      
      // Calculate expected value from unknown dice
      const result = this.probEngine.calculateExpectedValue(
        unknownDiceTypes,
        face,
        ownCount,
        true
      );

      if (result.expectedCount > bestExpected) {
        bestExpected = result.expectedCount;
        bestFace = face;
        bestProb = result.probability;
      }
    }

    // Bid at a level where we have good probability
    let quantity = Math.floor(bestExpected);
    
    // Ensure we have at least BID_SAFE_THRESHOLD probability
    while (quantity > 1) {
      const prob = this.probEngine.calculateBidProbability(
        ownDice.map(d => ({ type: d.type, faceValue: d.faceValue })),
        unknownDiceTypes,
        quantity,
        bestFace
      );
      
      if (prob >= this.BID_SAFE_THRESHOLD) {
        break;
      }
      quantity--;
    }

    quantity = Math.max(1, quantity);

    return {
      action: 'bid',
      bid: { quantity, faceValue: bestFace },
      confidence: bestProb,
      reasoning: `Opening bid with ${(bestProb * 100).toFixed(1)}% probability`
    };
  }

  /**
   * Make a calculated bid that maintains safe probability
   */
  private makeCalculatedBid(context: AIGameContext, currentBid: Bid): AIDecision {
    const { ownDice, unknownDiceTypes, totalDiceCount } = context;
    const faceCounts = this.countOwnDice(ownDice);

    // Find the best valid bid
    let bestBid: { quantity: number; faceValue: number } | null = null;
    let bestScore = -1;

    // Try all valid bid options
    for (let face = 1; face <= 6; face++) {
      const minQuantity = this.getMinimumQuantity(currentBid, face);
      
      for (let qty = minQuantity; qty <= totalDiceCount; qty++) {
        const prob = this.probEngine.calculateBidProbability(
          ownDice.map(d => ({ type: d.type, faceValue: d.faceValue })),
          unknownDiceTypes,
          qty,
          face
        );

        if (prob >= this.BID_SAFE_THRESHOLD) {
          // Score based on probability and how much we're raising
          const raiseAmount = qty - currentBid.quantity + (face - currentBid.faceValue) * 0.1;
          const score = prob - raiseAmount * 0.05; // Prefer smaller raises

          if (score > bestScore) {
            bestScore = score;
            bestBid = { quantity: qty, faceValue: face };
          }
        }
      }
    }

    if (bestBid) {
      const prob = this.probEngine.calculateBidProbability(
        ownDice.map(d => ({ type: d.type, faceValue: d.faceValue })),
        unknownDiceTypes,
        bestBid.quantity,
        bestBid.faceValue
      );

      return {
        action: 'bid',
        bid: bestBid,
        confidence: prob,
        reasoning: `Calculated bid with ${(prob * 100).toFixed(1)}% probability`
      };
    }

    // No safe bid found, call dudo
    return {
      action: 'dudo',
      confidence: 0.6,
      reasoning: 'No safe bids available'
    };
  }

  /**
   * Get minimum quantity for a valid bid
   */
  private getMinimumQuantity(currentBid: Bid, targetFace: number): number {
    if (targetFace > currentBid.faceValue) {
      return currentBid.quantity;
    } else {
      return currentBid.quantity + 1;
    }
  }

  /**
   * Consider calling dudo with card support
   */
  private considerDudo(
    context: AIGameContext,
    bidProb: number,
    cards: Card[]
  ): AIDecision {
    const dudoSuccessProb = 1 - bidProb;

    // Check for useful cards
    const hasInsurance = cards.some(c => c.type === 'insurance');
    const hasDoubleDudo = cards.some(c => c.type === 'double_dudo');

    // Use Double Dudo if we're very confident
    if (hasDoubleDudo && dudoSuccessProb > 0.75) {
      const card = cards.find(c => c.type === 'double_dudo')!;
      return {
        action: 'play_card',
        cardPlay: {
          cardId: card.id,
          cardType: 'double_dudo'
        },
        confidence: dudoSuccessProb,
        reasoning: `Double Dudo with ${(dudoSuccessProb * 100).toFixed(1)}% success probability`
      };
    }

    // Use Insurance if we're less confident
    if (hasInsurance && dudoSuccessProb > 0.55 && dudoSuccessProb < 0.7) {
      const card = cards.find(c => c.type === 'insurance')!;
      return {
        action: 'play_card',
        cardPlay: {
          cardId: card.id,
          cardType: 'insurance'
        },
        confidence: dudoSuccessProb,
        reasoning: `Insurance Dudo with ${(dudoSuccessProb * 100).toFixed(1)}% success probability`
      };
    }

    return {
      action: 'dudo',
      confidence: dudoSuccessProb,
      reasoning: `Dudo with ${(dudoSuccessProb * 100).toFixed(1)}% success probability`
    };
  }

  /**
   * Consider playing a card for strategic advantage
   */
  private considerCardPlay(context: AIGameContext): AIDecision | null {
    const { ownCards, currentBid, roundNumber, players, ownPlayerId } = context;

    if (ownCards.length === 0) return null;

    const otherPlayers = players.filter(p => p.id !== ownPlayerId && !p.isEliminated);

    // Early game: Use Peek to gather information
    if (roundNumber <= 2) {
      const peekCard = ownCards.find(c => c.type === 'peek');
      if (peekCard && otherPlayers.length > 0) {
        // Target player with most dice
        const target = otherPlayers.reduce((a, b) => 
          a.diceCount > b.diceCount ? a : b
        );
        
        return {
          action: 'play_card',
          cardPlay: {
            cardId: peekCard.id,
            cardType: 'peek',
            targetPlayerId: target.id
          },
          confidence: 0.7,
          reasoning: 'Early Peek for information gathering'
        };
      }
    }

    // Use Inflation to force opponents into difficult positions
    if (currentBid) {
      const inflationCard = ownCards.find(c => c.type === 'inflation');
      if (inflationCard) {
        // Calculate if inflated bid would be hard for next player
        const inflatedQuantity = currentBid.quantity + 1;
        const inflatedProb = this.probEngine.calculateBidProbability(
          context.ownDice.map(d => ({ type: d.type, faceValue: d.faceValue })),
          context.unknownDiceTypes,
          inflatedQuantity,
          currentBid.faceValue
        );

        // Use inflation if it makes the bid significantly harder
        if (inflatedProb < 0.35) {
          return {
            action: 'play_card',
            cardPlay: {
              cardId: inflationCard.id,
              cardType: 'inflation'
            },
            confidence: 0.6,
            reasoning: `Inflation to force ${(inflatedProb * 100).toFixed(1)}% probability bid`
          };
        }
      }
    }

    // Use Crack on opponent with most dice
    const crackCard = ownCards.find(c => c.type === 'crack');
    if (crackCard && otherPlayers.length > 0) {
      const target = otherPlayers.reduce((a, b) => 
        a.diceCount > b.diceCount ? a : b
      );
      
      if (target.diceCount >= 3) {
        return {
          action: 'play_card',
          cardPlay: {
            cardId: crackCard.id,
            cardType: 'crack',
            targetPlayerId: target.id
          },
          confidence: 0.6,
          reasoning: 'Crack to weaken leading opponent'
        };
      }
    }

    // Use Gauge for information (early game)
    if (roundNumber <= 3) {
      const gaugeCard = ownCards.find(c => c.type === 'gauge');
      if (gaugeCard && otherPlayers.length > 0) {
        // Select 2 dice from opponents with most dice
        const sortedPlayers = [...otherPlayers].sort((a, b) => b.diceCount - a.diceCount);
        const dieIds: string[] = [];
        for (const p of sortedPlayers) {
          for (let i = 0; i < p.diceCount && dieIds.length < 2; i++) {
            dieIds.push(`${p.id}-${i}`);
          }
          if (dieIds.length >= 2) break;
        }
        if (dieIds.length >= 2) {
          return {
            action: 'play_card',
            cardPlay: {
              cardId: gaugeCard.id,
              cardType: 'gauge',
              additionalData: { dieIds }
            },
            confidence: 0.6,
            reasoning: 'Gauge for early information'
          };
        }
      }
    }

    // Use Wild Shift strategically - shift bid to a face we have more of
    if (currentBid) {
      const wildShiftCard = ownCards.find(c => c.type === 'wild_shift');
      if (wildShiftCard) {
        const faceCounts = this.countOwnDice(context.ownDice);
        let bestFace = currentBid.faceValue;
        let bestCount = faceCounts[currentBid.faceValue] + (currentBid.faceValue !== 1 ? faceCounts[1] : 0);
        
        for (let face = 2; face <= 6; face++) {
          if (face === currentBid.faceValue) continue;
          const count = faceCounts[face] + faceCounts[1];
          if (count > bestCount) {
            bestCount = count;
            bestFace = face;
          }
        }
        
        if (bestFace !== currentBid.faceValue && bestCount >= 2) {
          return {
            action: 'play_card',
            cardPlay: {
              cardId: wildShiftCard.id,
              cardType: 'wild_shift',
              additionalData: { faceValue: bestFace }
            },
            confidence: 0.6,
            reasoning: `Wild shift to face ${bestFace} (have ${bestCount} matching)`
          };
        }
      }
    }

    // Use Phantom Bid for strategic bluffing
    const phantomBidCard = ownCards.find(c => c.type === 'phantom_bid');
    if (phantomBidCard && currentBid && Math.random() < 0.25) {
      return {
        action: 'play_card',
        cardPlay: {
          cardId: phantomBidCard.id,
          cardType: 'phantom_bid'
        },
        confidence: 0.5,
        reasoning: 'Phantom bid for strategic flexibility'
      };
    }

    // Use Reroll on worst die (showing 5 or 6)
    const rerollCard = ownCards.find(c => c.type === 'reroll_one');
    if (rerollCard) {
      const worstDie = context.ownDice.reduce((worst, die) => 
        die.faceValue > worst.faceValue ? die : worst
      , context.ownDice[0]);
      
      if (worstDie && worstDie.faceValue >= 5) {
        return {
          action: 'play_card',
          cardPlay: {
            cardId: rerollCard.id,
            cardType: 'reroll_one',
            targetDieId: worstDie.id
          },
          confidence: 0.5,
          reasoning: `Reroll die showing ${worstDie.faceValue}`
        };
      }
    }

    // Use Polish on lowest die type
    const polishCard = ownCards.find(c => c.type === 'polish');
    if (polishCard) {
      const dieTypes: DieType[] = ['d3', 'd4', 'd6', 'd8'];
      for (const type of dieTypes) {
        const die = context.ownDice.find(d => d.type === type);
        if (die) {
          return {
            action: 'play_card',
            cardPlay: {
              cardId: polishCard.id,
              cardType: 'polish',
              targetDieId: die.id
            },
            confidence: 0.55,
            reasoning: `Polish ${type} die`
          };
        }
      }
    }

    // Use Blind Swap if we have a bad die
    const blindSwapCard = ownCards.find(c => c.type === 'blind_swap');
    if (blindSwapCard && otherPlayers.length > 0) {
      const worstDie = context.ownDice.reduce((worst, die) => 
        die.faceValue > worst.faceValue ? die : worst
      , context.ownDice[0]);
      
      if (worstDie && worstDie.faceValue >= 5) {
        const target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
        return {
          action: 'play_card',
          cardPlay: {
            cardId: blindSwapCard.id,
            cardType: 'blind_swap',
            targetPlayerId: target.id,
            targetDieId: worstDie.id
          },
          confidence: 0.45,
          reasoning: 'Blind swap bad die'
        };
      }
    }

    // Use Late Dudo if previous bid looks suspicious
    const lateDudoCard = ownCards.find(c => c.type === 'late_dudo');
    if (lateDudoCard && context.previousBids && context.previousBids.length > 0) {
      const lastBid = context.previousBids[context.previousBids.length - 1];
      const lastBidProb = this.probEngine.calculateBidProbability(
        context.ownDice.map(d => ({ type: d.type, faceValue: d.faceValue })),
        context.unknownDiceTypes,
        lastBid.quantity,
        lastBid.faceValue
      );
      
      if (lastBidProb < 0.35) {
        return {
          action: 'play_card',
          cardPlay: {
            cardId: lateDudoCard.id,
            cardType: 'late_dudo'
          },
          confidence: 1 - lastBidProb,
          reasoning: `Late dudo on bid with ${(lastBidProb * 100).toFixed(1)}% probability`
        };
      }
    }

    return null;
  }

  /**
   * Adjust probability based on opponent bidding patterns
   */
  private adjustProbabilityWithOpponentModel(
    baseProbability: number,
    context: AIGameContext,
    currentBid: Bid
  ): number {
    const model = this.opponentModels.get(currentBid.playerId);
    if (!model) {
      return baseProbability;
    }

    // Adjust based on bluff frequency
    // If opponent bluffs often, reduce our estimate of bid validity
    const bluffAdjustment = model.bluffFrequency * 0.15;
    
    // Adjust based on face preferences
    const facePreference = model.facePreferences[currentBid.faceValue] || 1;
    const preferenceAdjustment = (facePreference - 1) * 0.1;

    return Math.max(0, Math.min(1, baseProbability - bluffAdjustment + preferenceAdjustment));
  }

  /**
   * Calculate dynamic Jonti threshold based on player's dice count
   * More dice = lower threshold (more willing to risk)
   * Fewer dice = higher threshold (more conservative)
   */
  private calculateDynamicJontiThreshold(context: AIGameContext): number {
    const ownDiceCount = context.ownDice.length;
    const totalDiceCount = context.totalDiceCount;
    
    // Base threshold
    let threshold = this.JONTI_EXACT_THRESHOLD;
    
    // Adjust based on own dice count
    if (ownDiceCount >= 4) {
      // Lots of dice - can afford to be more aggressive
      threshold = Math.max(0.15, threshold - 0.1);
    } else if (ownDiceCount === 3) {
      // Moderate dice count - use base threshold
      threshold = this.JONTI_EXACT_THRESHOLD;
    } else if (ownDiceCount === 2) {
      // Getting low - be more conservative
      threshold = Math.min(0.35, threshold + 0.1);
    } else {
      // Last die - very conservative (Jonti failure = elimination)
      threshold = Math.min(0.45, threshold + 0.2);
    }
    
    // Adjust based on relative position
    const avgDice = totalDiceCount / context.players.filter(p => !p.isEliminated).length;
    if (ownDiceCount > avgDice * 1.2) {
      // Ahead - can take more risks
      threshold = Math.max(0.15, threshold - 0.05);
    } else if (ownDiceCount < avgDice * 0.8) {
      // Behind - be more conservative
      threshold = Math.min(0.4, threshold + 0.05);
    }
    
    return threshold;
  }

  /**
   * Count own dice by face value
   */
  private countOwnDice(dice: { faceValue: number }[]): number[] {
    const counts = new Array(7).fill(0);
    for (const die of dice) {
      counts[die.faceValue]++;
    }
    return counts;
  }

  /**
   * Update opponent models after a round ends
   */
  public updateModels(context: AIGameContext, dudoResult?: any): void {
    if (!dudoResult) return;

    const { previousBids, roundNumber, totalDiceCount } = context;

    // Update model for each bidder
    for (const bid of previousBids) {
      let model = this.opponentModels.get(bid.playerId);
      
      if (!model) {
        model = {
          playerId: bid.playerId,
          bidHistory: [],
          bluffFrequency: 0.3, // Default assumption
          aggressiveness: 0.5,
          facePreferences: [0, 1, 1, 1, 1, 1, 1], // Index 0 unused
          lastUpdated: Date.now()
        };
        this.opponentModels.set(bid.playerId, model);
      }

      // Determine if bid was a bluff based on dudo result
      const wasBluff = dudoResult && 
        dudoResult.bid.playerId === bid.playerId && 
        dudoResult.success; // Dudo was successful = bid was a bluff

      // Add to history
      model.bidHistory.push({
        bid,
        wasBluff: wasBluff ?? null,
        roundNumber,
        totalDiceInPlay: totalDiceCount
      });

      // Update bluff frequency (exponential moving average)
      if (wasBluff !== null) {
        const alpha = 0.3; // Learning rate
        model.bluffFrequency = alpha * (wasBluff ? 1 : 0) + (1 - alpha) * model.bluffFrequency;
      }

      // Update face preferences
      model.facePreferences[bid.faceValue] += 0.1;
      
      // Normalize face preferences
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
}

export default HardStrategy;
