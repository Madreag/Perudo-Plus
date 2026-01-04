// ============================================
// Perudo+ Probability Engine
// Implements Poisson Binomial Distribution for exact probability calculations
// ============================================

import { DieType } from '../../shared/types';
import { DICE_FACES } from '../../shared/dice';
import { ProbabilityResult, DiceProbabilities } from '../../types/AI';

/**
 * ProbabilityEngine - The mathematical core for AI probability calculations
 * 
 * Uses Poisson Binomial Distribution (PBD) via dynamic programming (recursive convolution)
 * to calculate exact probabilities for mixed dice scenarios.
 */
export class ProbabilityEngine {
  // Cache for PBD results to avoid recalculation
  private pdbCache: Map<string, number[]> = new Map();
  
  // Cache for individual die probabilities
  private dieProbCache: Map<string, number[]> = new Map();
  
  // Maximum cache size to prevent memory issues
  private readonly MAX_CACHE_SIZE = 10000;

  constructor() {
    this.initializeDieProbabilities();
  }

  /**
   * Pre-calculate and cache probabilities for each die type
   */
  private initializeDieProbabilities(): void {
    const dieTypes: DieType[] = ['d3', 'd4', 'd6', 'd8', 'd10'];
    
    for (const dieType of dieTypes) {
      const faces = DICE_FACES[dieType];
      const probs = new Array(7).fill(0); // Index 0 unused, 1-6 for faces
      
      for (const face of faces) {
        probs[face] += 1 / faces.length;
      }
      
      this.dieProbCache.set(dieType, probs);
    }
  }

  /**
   * Get the probability of rolling a specific face on a die type
   */
  public getFaceProbability(dieType: DieType, faceValue: number): number {
    const probs = this.dieProbCache.get(dieType);
    if (!probs || faceValue < 1 || faceValue > 6) {
      return 0;
    }
    return probs[faceValue];
  }

  /**
   * Get effective probability including wild 1s
   * For face > 1: P(face) + P(1)
   * For face = 1: P(1)
   */
  public getEffectiveProbability(dieType: DieType, faceValue: number): number {
    if (faceValue === 1) {
      return this.getFaceProbability(dieType, 1);
    }
    return this.getFaceProbability(dieType, faceValue) + this.getFaceProbability(dieType, 1);
  }

  /**
   * Calculate the probability of getting at least 'quantityNeeded' successes
   * from a set of dice with different types (Poisson Binomial Distribution)
   * 
   * @param unknownDice Array of die types we don't know the values of
   * @param targetFace The face value we're counting (1-6)
   * @param quantityNeeded Minimum number of successes needed
   * @param includeWilds Whether to include 1s as wild (default true for faces > 1)
   * @returns Probability of getting at least quantityNeeded successes
   */
  public calculateProbability(
    unknownDice: DieType[],
    targetFace: number,
    quantityNeeded: number,
    includeWilds: boolean = true
  ): number {
    if (unknownDice.length === 0) {
      return quantityNeeded <= 0 ? 1 : 0;
    }
    
    if (quantityNeeded <= 0) {
      return 1;
    }
    
    if (quantityNeeded > unknownDice.length) {
      return 0;
    }

    // Get success probabilities for each die
    const successProbs = unknownDice.map(dieType => {
      if (includeWilds && targetFace !== 1) {
        return this.getEffectiveProbability(dieType, targetFace);
      }
      return this.getFaceProbability(dieType, targetFace);
    });

    // Calculate PBD using dynamic programming
    const pmf = this.calculatePBD(successProbs);
    
    // Sum probabilities for k >= quantityNeeded
    let probability = 0;
    for (let k = quantityNeeded; k <= unknownDice.length; k++) {
      probability += pmf[k];
    }
    
    return Math.min(1, Math.max(0, probability));
  }

  /**
   * Calculate the full Poisson Binomial Distribution PMF
   * Uses dynamic programming (convolution) approach
   * 
   * @param successProbs Array of success probabilities for each trial
   * @returns Array where index k = P(exactly k successes)
   */
  private calculatePBD(successProbs: number[]): number[] {
    const n = successProbs.length;
    
    // Check cache
    const cacheKey = this.createCacheKey(successProbs);
    const cached = this.pdbCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Initialize: P(0 successes from 0 trials) = 1
    let prev = [1];
    
    // Convolve each die's probability
    for (let i = 0; i < n; i++) {
      const p = successProbs[i];
      const q = 1 - p;
      const curr = new Array(i + 2).fill(0);
      
      for (let k = 0; k <= i; k++) {
        // P(k successes) contributes to:
        // - P(k successes) with probability q (failure)
        // - P(k+1 successes) with probability p (success)
        curr[k] += prev[k] * q;
        curr[k + 1] += prev[k] * p;
      }
      
      prev = curr;
    }
    
    // Cache the result
    this.cacheResult(cacheKey, prev);
    
    return prev;
  }

  /**
   * Calculate expected count and variance for a bid
   */
  public calculateExpectedValue(
    unknownDice: DieType[],
    targetFace: number,
    knownCount: number = 0,
    includeWilds: boolean = true
  ): ProbabilityResult {
    if (unknownDice.length === 0) {
      return {
        probability: 1,
        expectedCount: knownCount,
        variance: 0
      };
    }

    // Calculate expected value and variance
    let expectedFromUnknown = 0;
    let variance = 0;
    
    for (const dieType of unknownDice) {
      const p = includeWilds && targetFace !== 1
        ? this.getEffectiveProbability(dieType, targetFace)
        : this.getFaceProbability(dieType, targetFace);
      
      expectedFromUnknown += p;
      variance += p * (1 - p);
    }
    
    const totalExpected = knownCount + expectedFromUnknown;
    
    // Calculate probability of at least floor(totalExpected) successes
    const quantityNeeded = Math.max(0, Math.floor(totalExpected) - knownCount);
    const probability = this.calculateProbability(
      unknownDice,
      targetFace,
      quantityNeeded,
      includeWilds
    );
    
    return {
      probability,
      expectedCount: totalExpected,
      variance
    };
  }

  /**
   * Calculate probability that a specific bid is true
   * (there are at least 'quantity' dice showing 'faceValue')
   */
  public calculateBidProbability(
    ownDice: { type: DieType; faceValue: number }[],
    unknownDice: DieType[],
    bidQuantity: number,
    bidFaceValue: number
  ): number {
    // Count matching dice in own hand
    let ownCount = 0;
    for (const die of ownDice) {
      if (die.faceValue === bidFaceValue) {
        ownCount++;
      } else if (bidFaceValue !== 1 && die.faceValue === 1) {
        // Wild 1s count for non-1 bids
        ownCount++;
      }
    }
    
    // Calculate how many more we need from unknown dice
    const neededFromUnknown = Math.max(0, bidQuantity - ownCount);
    
    if (neededFromUnknown === 0) {
      return 1; // We already have enough
    }
    
    return this.calculateProbability(
      unknownDice,
      bidFaceValue,
      neededFromUnknown,
      bidFaceValue !== 1
    );
  }

  /**
   * Calculate probability that a bid is exactly correct (for Calza/Jonti)
   */
  public calculateExactProbability(
    ownDice: { type: DieType; faceValue: number }[],
    unknownDice: DieType[],
    bidQuantity: number,
    bidFaceValue: number
  ): number {
    // Count matching dice in own hand
    let ownCount = 0;
    for (const die of ownDice) {
      if (die.faceValue === bidFaceValue) {
        ownCount++;
      } else if (bidFaceValue !== 1 && die.faceValue === 1) {
        ownCount++;
      }
    }
    
    const neededExact = bidQuantity - ownCount;
    
    if (neededExact < 0 || neededExact > unknownDice.length) {
      return 0;
    }
    
    // Get success probabilities
    const successProbs = unknownDice.map(dieType => {
      if (bidFaceValue !== 1) {
        return this.getEffectiveProbability(dieType, bidFaceValue);
      }
      return this.getFaceProbability(dieType, bidFaceValue);
    });
    
    // Calculate PMF and return exact probability
    const pmf = this.calculatePBD(successProbs);
    return pmf[neededExact] || 0;
  }

  /**
   * Get all dice probability distributions
   */
  public getAllDiceProbabilities(): DiceProbabilities[] {
    const dieTypes: DieType[] = ['d3', 'd4', 'd6', 'd8', 'd10'];
    return dieTypes.map(dieType => ({
      dieType,
      faceProbabilities: this.dieProbCache.get(dieType)?.slice(1) || []
    }));
  }

  /**
   * Create a cache key from success probabilities
   */
  private createCacheKey(successProbs: number[]): string {
    // Round to 4 decimal places for cache key
    return successProbs.map(p => p.toFixed(4)).join(',');
  }

  /**
   * Cache a PBD result with size management
   */
  private cacheResult(key: string, result: number[]): void {
    if (this.pdbCache.size >= this.MAX_CACHE_SIZE) {
      // Clear half the cache when full (simple LRU approximation)
      const keys = Array.from(this.pdbCache.keys());
      for (let i = 0; i < keys.length / 2; i++) {
        this.pdbCache.delete(keys[i]);
      }
    }
    this.pdbCache.set(key, result);
  }

  /**
   * Clear all caches
   */
  public clearCache(): void {
    this.pdbCache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  public getCacheStats(): { pdbCacheSize: number; dieProbCacheSize: number } {
    return {
      pdbCacheSize: this.pdbCache.size,
      dieProbCacheSize: this.dieProbCache.size
    };
  }
}

// Singleton instance for shared use
let probabilityEngineInstance: ProbabilityEngine | null = null;

export function getProbabilityEngine(): ProbabilityEngine {
  if (!probabilityEngineInstance) {
    probabilityEngineInstance = new ProbabilityEngine();
  }
  return probabilityEngineInstance;
}

export default ProbabilityEngine;
