// ============================================
// Normal AI Strategy - "The Casual"
// Heuristic-based decision making assuming d6 dice
// ============================================

import {
  AIStrategy,
  AIDecision,
  AIGameContext,
  AIDifficulty
} from '../../../types/AI';
import { Bid, Card } from '../../../shared/types';

/**
 * NormalStrategy - "The Casual"
 * 
 * Logic:
 * - Assumes all unknown dice are standard d6 (P_eff = 1/3 for any face with wilds)
 * - Formula: Expected = Own_Count + (Unknown_Count / 3)
 * - Bids floor(Expected)
 * - Cards: Reactive only (e.g., use 'Insurance' if calling Dudo on marginal bid)
 */
export class NormalStrategy implements AIStrategy {
  public readonly difficulty = AIDifficulty.NORMAL;
  public readonly name = 'The Casual';

  // Assumed probability for any face (including wilds) on a d6
  private readonly ASSUMED_PROBABILITY = 1 / 3;

  /**
   * Make a decision based on d6 heuristics
   */
  public async makeDecision(context: AIGameContext): Promise<AIDecision> {
    const { currentBid, ownDice, ownCards, totalDiceCount, roundNumber, gameMode } = context;

    // Calculate unknown dice count
    const unknownDiceCount = totalDiceCount - ownDice.length;

    // Consider playing proactive cards first (skip in Classic mode)
    if (gameMode !== 'classic') {
      const cardDecision = this.considerProactiveCards(context, unknownDiceCount);
      if (cardDecision) {
        return cardDecision;
      }
    }

    // If no current bid, make an opening bid
    if (!currentBid) {
      return this.makeOpeningBid(context, unknownDiceCount);
    }

    // Evaluate the current bid
    const evaluation = this.evaluateBid(context, currentBid, unknownDiceCount);

    // Decision thresholds
    if (evaluation.expectedTotal < currentBid.quantity * 0.7) {
      // Bid seems too high, consider dudo
      return this.considerDudo(context, evaluation, ownCards);
    }

    if (evaluation.expectedTotal >= currentBid.quantity * 1.2) {
      // Bid seems safe, raise confidently
      return this.makeConfidentBid(context, currentBid, evaluation);
    }

    // Marginal situation - make a conservative bid or call
    return this.makeMarginalDecision(context, currentBid, evaluation, ownCards);
  }

  /**
   * Consider playing proactive cards (information gathering, dice manipulation)
   */
  private considerProactiveCards(context: AIGameContext, unknownDiceCount: number): AIDecision | null {
    const { ownCards, ownDice, players, ownPlayerId, roundNumber, currentBid } = context;
    
    if (ownCards.length === 0) return null;

    const otherPlayers = players.filter(p => p.id !== ownPlayerId && !p.isEliminated);
    if (otherPlayers.length === 0) return null;

    // Early rounds: Use Peek to gather information (40% chance)
    if (roundNumber <= 3 && Math.random() < 0.4) {
      const peekCard = ownCards.find(c => c.type === 'peek');
      if (peekCard) {
        // Target player with most dice
        const target = otherPlayers.reduce((a, b) => a.diceCount > b.diceCount ? a : b);
        return {
          action: 'play_card',
          cardPlay: {
            cardId: peekCard.id,
            cardType: 'peek',
            targetPlayerId: target.id
          },
          confidence: 0.6,
          reasoning: 'Early peek for information'
        };
      }
    }

    // Reroll bad dice (dice showing 5 or 6 that don't match any reasonable bid)
    const rerollCard = ownCards.find(c => c.type === 'reroll_one');
    if (rerollCard) {
      const badDie = ownDice.find(d => d.faceValue >= 5);
      if (badDie && Math.random() < 0.35) {
        return {
          action: 'play_card',
          cardPlay: {
            cardId: rerollCard.id,
            cardType: 'reroll_one',
            targetDieId: badDie.id
          },
          confidence: 0.5,
          reasoning: 'Reroll high-value die'
        };
      }
    }

    // Polish lowest type die (30% chance)
    const polishCard = ownCards.find(c => c.type === 'polish');
    if (polishCard && Math.random() < 0.3) {
      const lowestDie = ownDice.find(d => d.type === 'd3') || 
                        ownDice.find(d => d.type === 'd4') ||
                        ownDice.find(d => d.type === 'd6');
      if (lowestDie && lowestDie.type !== 'd10') {
        return {
          action: 'play_card',
          cardPlay: {
            cardId: polishCard.id,
            cardType: 'polish',
            targetDieId: lowestDie.id
          },
          confidence: 0.5,
          reasoning: 'Upgrade low die'
        };
      }
    }

    // Crack leading opponent (25% chance)
    const crackCard = ownCards.find(c => c.type === 'crack');
    if (crackCard && Math.random() < 0.25) {
      const target = otherPlayers.reduce((a, b) => a.diceCount > b.diceCount ? a : b);
      if (target.diceCount >= 3) {
        return {
          action: 'play_card',
          cardPlay: {
            cardId: crackCard.id,
            cardType: 'crack',
            targetPlayerId: target.id
          },
          confidence: 0.5,
          reasoning: 'Crack leading opponent'
        };
      }
    }

    // Use late dudo if previous bid looks suspicious (20% chance)
    const lateDudoCard = ownCards.find(c => c.type === 'late_dudo');
    if (lateDudoCard && context.previousBids && context.previousBids.length > 0 && Math.random() < 0.2) {
      const lastBid = context.previousBids[context.previousBids.length - 1];
      const expectedForLastBid = unknownDiceCount * this.ASSUMED_PROBABILITY;
      if (lastBid.quantity > expectedForLastBid * 1.5) {
        return {
          action: 'play_card',
          cardPlay: {
            cardId: lateDudoCard.id,
            cardType: 'late_dudo'
          },
          confidence: 0.5,
          reasoning: 'Late dudo on suspicious previous bid'
        };
      }
    }

    return null;
  }

  /**
   * Evaluate a bid using d6 heuristics
   */
  private evaluateBid(
    context: AIGameContext,
    bid: Bid,
    unknownDiceCount: number
  ): { ownCount: number; expectedFromUnknown: number; expectedTotal: number } {
    const { ownDice } = context;

    // Count matching dice in own hand
    let ownCount = 0;
    for (const die of ownDice) {
      if (die.faceValue === bid.faceValue) {
        ownCount++;
      } else if (bid.faceValue !== 1 && die.faceValue === 1) {
        // Wild 1s count for non-1 bids
        ownCount++;
      }
    }

    // Expected from unknown dice (assuming d6 with P_eff = 1/3)
    const expectedFromUnknown = unknownDiceCount * this.ASSUMED_PROBABILITY;
    const expectedTotal = ownCount + expectedFromUnknown;

    return { ownCount, expectedFromUnknown, expectedTotal };
  }

  /**
   * Make an opening bid
   */
  private makeOpeningBid(context: AIGameContext, unknownDiceCount: number): AIDecision {
    const { ownDice } = context;

    // Find the best face to bid on
    const faceCounts = this.countOwnDice(ownDice);
    
    let bestFace = 2;
    let bestCount = 0;

    for (let face = 2; face <= 6; face++) {
      const count = faceCounts[face] + faceCounts[1]; // Include wilds
      if (count > bestCount) {
        bestCount = count;
        bestFace = face;
      }
    }

    // Calculate expected total
    const expectedFromUnknown = unknownDiceCount * this.ASSUMED_PROBABILITY;
    const expectedTotal = bestCount + expectedFromUnknown;

    // Bid floor of expected, minimum 1
    const quantity = Math.max(1, Math.floor(expectedTotal));

    return {
      action: 'bid',
      bid: { quantity, faceValue: bestFace },
      confidence: 0.6,
      reasoning: `Opening bid based on ${bestCount} in hand + ${expectedFromUnknown.toFixed(1)} expected`
    };
  }

  /**
   * Consider calling dudo
   */
  private considerDudo(
    context: AIGameContext,
    evaluation: { ownCount: number; expectedFromUnknown: number; expectedTotal: number },
    cards: Card[]
  ): AIDecision {
    // Check if we have insurance for safety
    const hasInsurance = cards.some(c => c.type === 'insurance');
    
    // Check if we have double dudo for high-risk/high-reward
    const hasDoubleDudo = cards.some(c => c.type === 'double_dudo');

    // If we have insurance and the bid looks bad, use it
    if (hasInsurance && evaluation.expectedTotal < context.currentBid!.quantity * 0.5) {
      const insuranceCard = cards.find(c => c.type === 'insurance')!;
      return {
        action: 'play_card',
        cardPlay: {
          cardId: insuranceCard.id,
          cardType: 'insurance'
        },
        confidence: 0.7,
        reasoning: 'Using insurance before risky dudo call'
      };
    }

    return {
      action: 'dudo',
      confidence: 0.6,
      reasoning: `Expected ${evaluation.expectedTotal.toFixed(1)} vs bid of ${context.currentBid!.quantity}`
    };
  }

  /**
   * Make a confident bid when we have good information
   */
  private makeConfidentBid(
    context: AIGameContext,
    currentBid: Bid,
    evaluation: { ownCount: number; expectedFromUnknown: number; expectedTotal: number }
  ): AIDecision {
    const { ownDice, totalDiceCount } = context;
    const faceCounts = this.countOwnDice(ownDice);

    // Try to bid on a face we have
    for (let face = 2; face <= 6; face++) {
      const count = faceCounts[face] + faceCounts[1];
      if (count >= 2) {
        // We have a good amount of this face
        const bid = this.createValidBid(currentBid, face, count, totalDiceCount, evaluation.expectedFromUnknown);
        if (bid) {
          return {
            action: 'bid',
            bid,
            confidence: 0.7,
            reasoning: `Confident bid on face ${face} with ${count} in hand`
          };
        }
      }
    }

    // Fallback: increment current bid minimally
    return this.makeMinimalIncrement(currentBid, totalDiceCount);
  }

  /**
   * Make a decision in a marginal situation
   */
  private makeMarginalDecision(
    context: AIGameContext,
    currentBid: Bid,
    evaluation: { ownCount: number; expectedFromUnknown: number; expectedTotal: number },
    cards: Card[]
  ): AIDecision {
    const { totalDiceCount } = context;

    // 40% chance to call dudo in marginal situations
    if (Math.random() < 0.4) {
      // Check for insurance
      const hasInsurance = cards.some(c => c.type === 'insurance');
      if (hasInsurance) {
        const insuranceCard = cards.find(c => c.type === 'insurance')!;
        return {
          action: 'play_card',
          cardPlay: {
            cardId: insuranceCard.id,
            cardType: 'insurance'
          },
          confidence: 0.5,
          reasoning: 'Using insurance for marginal dudo'
        };
      }

      return {
        action: 'dudo',
        confidence: 0.4,
        reasoning: 'Marginal dudo call'
      };
    }

    // Make a minimal increment
    return this.makeMinimalIncrement(currentBid, totalDiceCount);
  }

  /**
   * Create a valid bid for a specific face
   */
  private createValidBid(
    currentBid: Bid,
    targetFace: number,
    ownCount: number,
    totalDiceCount: number,
    expectedFromUnknown: number
  ): { quantity: number; faceValue: number } | null {
    const expectedTotal = ownCount + expectedFromUnknown;
    let quantity: number;

    if (targetFace > currentBid.faceValue) {
      // Can keep same quantity or go higher
      quantity = Math.max(currentBid.quantity, Math.floor(expectedTotal));
    } else if (targetFace === currentBid.faceValue) {
      // Must increase quantity
      quantity = currentBid.quantity + 1;
    } else {
      // Lower face, must increase quantity
      quantity = currentBid.quantity + 1;
    }

    // Validate
    if (quantity > totalDiceCount) {
      return null;
    }

    // Don't bid more than expected + 1
    if (quantity > expectedTotal + 1) {
      return null;
    }

    return { quantity, faceValue: targetFace };
  }

  /**
   * Make a minimal valid increment to the current bid
   */
  private makeMinimalIncrement(currentBid: Bid, totalDiceCount: number): AIDecision {
    // Option 1: Increase face value, keep quantity
    if (currentBid.faceValue < 6) {
      return {
        action: 'bid',
        bid: { quantity: currentBid.quantity, faceValue: currentBid.faceValue + 1 },
        confidence: 0.5,
        reasoning: 'Minimal increment - increase face'
      };
    }

    // Option 2: Increase quantity, any face
    if (currentBid.quantity + 1 <= totalDiceCount) {
      return {
        action: 'bid',
        bid: { quantity: currentBid.quantity + 1, faceValue: 2 },
        confidence: 0.4,
        reasoning: 'Minimal increment - increase quantity'
      };
    }

    // No valid bid possible, must call dudo
    return {
      action: 'dudo',
      confidence: 0.6,
      reasoning: 'No valid bids remaining'
    };
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
   * Update models - Normal AI doesn't track opponents
   */
  public updateModels(): void {
    // No-op for Normal AI
  }

  /**
   * Reset strategy state
   */
  public reset(): void {
    // No state to reset for Normal AI
  }
}

export default NormalStrategy;
