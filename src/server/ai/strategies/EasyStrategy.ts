// ============================================
// Easy AI Strategy - "The Town Drunk"
// Stochastic decision making with minimal logic
// ============================================

import {
  AIStrategy,
  AIDecision,
  AIGameContext,
  AIDifficulty,
  AIActionType
} from '../../../types/AI';
import { Bid } from '../../../shared/types';

/**
 * EasyStrategy - "The Town Drunk"
 * 
 * Logic:
 * - 60% random valid bid
 * - 40% bid based on own hand count + random(0-1)
 * - Cards: Random usage (20% chance)
 * - No probability calculations
 */
export class EasyStrategy implements AIStrategy {
  public readonly difficulty = AIDifficulty.EASY;
  public readonly name = 'The Town Drunk';

  /**
   * Make a decision based on simple stochastic rules
   */
  public async makeDecision(context: AIGameContext): Promise<AIDecision> {
    const { currentBid, ownDice, ownCards, totalDiceCount } = context;

    // 20% chance to play a random card if we have any
    if (ownCards.length > 0 && Math.random() < 0.2) {
      const cardDecision = this.tryPlayRandomCard(context);
      if (cardDecision) {
        return cardDecision;
      }
    }

    // If no current bid, make an opening bid
    if (!currentBid) {
      return this.makeOpeningBid(context);
    }

    // Decide whether to bid or call dudo
    // Simple logic: if bid seems too high, call dudo
    const dudoChance = this.calculateDudoChance(context);
    
    if (Math.random() < dudoChance) {
      return {
        action: 'dudo',
        confidence: 0.3 + Math.random() * 0.3,
        reasoning: 'Random dudo call'
      };
    }

    // Make a bid
    return this.makeBid(context);
  }

  /**
   * Calculate chance to call dudo (very rough heuristic)
   */
  private calculateDudoChance(context: AIGameContext): number {
    const { currentBid, totalDiceCount } = context;
    if (!currentBid) return 0;

    // Higher bids relative to total dice = more likely to call dudo
    const bidRatio = currentBid.quantity / totalDiceCount;
    
    // Base 10% chance, increases with bid ratio
    let chance = 0.1 + bidRatio * 0.5;
    
    // Cap at 60%
    return Math.min(0.6, chance);
  }

  /**
   * Make an opening bid
   */
  private makeOpeningBid(context: AIGameContext): AIDecision {
    const { ownDice, totalDiceCount } = context;

    // Count our dice by face value
    const faceCounts = this.countOwnDice(ownDice);
    
    // 60% chance: completely random valid bid
    if (Math.random() < 0.6) {
      const quantity = Math.max(1, Math.floor(Math.random() * Math.ceil(totalDiceCount / 3)) + 1);
      const faceValue = Math.floor(Math.random() * 6) + 1;
      
      return {
        action: 'bid',
        bid: { quantity, faceValue },
        confidence: 0.2 + Math.random() * 0.3,
        reasoning: 'Random opening bid'
      };
    }

    // 40% chance: bid based on own hand
    // Find the face we have most of (including wilds)
    let bestFace = 2;
    let bestCount = 0;
    
    for (let face = 2; face <= 6; face++) {
      const count = faceCounts[face] + faceCounts[1]; // Include wilds
      if (count > bestCount) {
        bestCount = count;
        bestFace = face;
      }
    }

    // Bid our count + random 0-1
    const quantity = Math.max(1, bestCount + Math.floor(Math.random() * 2));
    
    return {
      action: 'bid',
      bid: { quantity, faceValue: bestFace },
      confidence: 0.4 + Math.random() * 0.2,
      reasoning: 'Hand-based opening bid'
    };
  }

  /**
   * Make a bid that's higher than the current bid
   */
  private makeBid(context: AIGameContext): AIDecision {
    const { currentBid, ownDice, totalDiceCount } = context;
    if (!currentBid) {
      return this.makeOpeningBid(context);
    }

    const faceCounts = this.countOwnDice(ownDice);

    // 60% chance: random valid increment
    if (Math.random() < 0.6) {
      return this.makeRandomValidBid(currentBid, totalDiceCount);
    }

    // 40% chance: try to bid on something we have
    // Find a face we have that we can bid on
    for (let face = 2; face <= 6; face++) {
      const count = faceCounts[face] + faceCounts[1];
      if (count > 0) {
        // Try to bid this face with a valid quantity
        const minQuantity = face > currentBid.faceValue 
          ? currentBid.quantity 
          : currentBid.quantity + 1;
        
        if (minQuantity <= totalDiceCount) {
          const quantity = minQuantity + Math.floor(Math.random() * 2);
          return {
            action: 'bid',
            bid: { quantity: Math.min(quantity, totalDiceCount), faceValue: face },
            confidence: 0.4 + Math.random() * 0.2,
            reasoning: 'Hand-based bid'
          };
        }
      }
    }

    // Fallback to random valid bid
    return this.makeRandomValidBid(currentBid, totalDiceCount);
  }

  /**
   * Make a random but valid bid increment
   */
  private makeRandomValidBid(currentBid: Bid, totalDiceCount: number): AIDecision {
    // Options: increase quantity, or increase face (if not at 6)
    const options: { quantity: number; faceValue: number }[] = [];

    // Option 1: Same face, higher quantity
    if (currentBid.quantity + 1 <= totalDiceCount) {
      options.push({
        quantity: currentBid.quantity + 1,
        faceValue: currentBid.faceValue
      });
    }

    // Option 2: Higher face, same or higher quantity
    for (let face = currentBid.faceValue + 1; face <= 6; face++) {
      options.push({
        quantity: currentBid.quantity,
        faceValue: face
      });
      if (currentBid.quantity + 1 <= totalDiceCount) {
        options.push({
          quantity: currentBid.quantity + 1,
          faceValue: face
        });
      }
    }

    // Option 3: Lower face, higher quantity (must be higher quantity)
    for (let face = 1; face < currentBid.faceValue; face++) {
      if (currentBid.quantity + 1 <= totalDiceCount) {
        options.push({
          quantity: currentBid.quantity + 1,
          faceValue: face
        });
      }
    }

    if (options.length === 0) {
      // No valid bids, must call dudo
      return {
        action: 'dudo',
        confidence: 0.5,
        reasoning: 'No valid bids available'
      };
    }

    // Pick a random option
    const chosen = options[Math.floor(Math.random() * options.length)];
    
    return {
      action: 'bid',
      bid: chosen,
      confidence: 0.3 + Math.random() * 0.3,
      reasoning: 'Random valid bid'
    };
  }

  /**
   * Try to play a random card
   */
  private tryPlayRandomCard(context: AIGameContext): AIDecision | null {
    const { ownCards, players, ownPlayerId } = context;
    
    if (ownCards.length === 0) return null;

    // Pick a random card
    const card = ownCards[Math.floor(Math.random() * ownCards.length)];
    
    // Get other players for targeting
    const otherPlayers = players.filter(p => p.id !== ownPlayerId && !p.isEliminated);
    
    // Simple card playing logic
    switch (card.type) {
      case 'peek':
      case 'crack':
      case 'blind_swap':
        if (otherPlayers.length > 0) {
          const target = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
          return {
            action: 'play_card',
            cardPlay: {
              cardId: card.id,
              cardType: card.type,
              targetPlayerId: target.id
            },
            confidence: 0.3,
            reasoning: 'Random card play'
          };
        }
        break;
      
      case 'reroll_one':
      case 'polish':
        if (context.ownDice.length > 0) {
          const die = context.ownDice[Math.floor(Math.random() * context.ownDice.length)];
          return {
            action: 'play_card',
            cardPlay: {
              cardId: card.id,
              cardType: card.type,
              targetDieId: die.id
            },
            confidence: 0.3,
            reasoning: 'Random card play on own die'
          };
        }
        break;
      
      case 'false_tell':
        // Just announce something random
        return {
          action: 'play_card',
          cardPlay: {
            cardId: card.id,
            cardType: card.type,
            additionalData: { 
              claimedFace: Math.floor(Math.random() * 6) + 1,
              claimedType: ['d3', 'd4', 'd6', 'd8', 'd10'][Math.floor(Math.random() * 5)]
            }
          },
          confidence: 0.3,
          reasoning: 'Random false tell'
        };
      
      // Skip complex cards for Easy AI
      default:
        return null;
    }

    return null;
  }

  /**
   * Count own dice by face value
   */
  private countOwnDice(dice: { faceValue: number }[]): number[] {
    const counts = new Array(7).fill(0); // Index 0 unused
    for (const die of dice) {
      counts[die.faceValue]++;
    }
    return counts;
  }

  /**
   * Update models - Easy AI doesn't track opponents
   */
  public updateModels(): void {
    // No-op for Easy AI
  }

  /**
   * Reset strategy state
   */
  public reset(): void {
    // No state to reset for Easy AI
  }
}

export default EasyStrategy;
