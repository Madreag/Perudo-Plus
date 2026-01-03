// ============================================
// Perudo+ Dice Logic Module
// ============================================

import { v4 as uuidv4 } from 'uuid';
import { Die, DieType } from './types';

// Dice face mappings - all dice map to values 1-6
// Larger dice have more consistent low values
export const DICE_FACES: Record<DieType, number[]> = {
  'd3': [1, 2, 3],
  'd4': [1, 2, 3, 4],
  'd6': [1, 2, 3, 4, 5, 6],
  'd8': [1, 2, 3, 4, 5, 6, 1, 2],      // Extra 1s and 2s
  'd10': [1, 2, 3, 4, 5, 6, 1, 2, 3, 4] // Extra 1-4
};

// Dice type order for upgrades/downgrades
export const DICE_ORDER: DieType[] = ['d3', 'd4', 'd6', 'd8', 'd10'];

/**
 * Roll a single die and return its normalized face value (1-6)
 */
export function rollDie(dieType: DieType): number {
  const faces = DICE_FACES[dieType];
  const randomIndex = Math.floor(Math.random() * faces.length);
  return faces[randomIndex];
}

/**
 * Create a new die of the specified type
 */
export function createDie(dieType: DieType): Die {
  return {
    id: uuidv4(),
    type: dieType,
    faceValue: rollDie(dieType)
  };
}

/**
 * Re-roll an existing die
 */
export function rerollDie(die: Die): Die {
  return {
    ...die,
    faceValue: rollDie(die.type)
  };
}

/**
 * Get a random die type (for starting loadout)
 */
export function getRandomDieType(exclude: DieType[] = ['d6']): DieType {
  const available = DICE_ORDER.filter(d => !exclude.includes(d));
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Create starting dice loadout for a player
 * Default: 3 x d6 + 2 random (d3, d4, d8, or d10)
 */
export function createStartingDice(): Die[] {
  return [
    createDie('d6'),
    createDie('d6'),
    createDie('d6'),
    createDie(getRandomDieType(['d6'])),
    createDie(getRandomDieType(['d6']))
  ];
}

/**
 * Create starting dice for classic mode (all d6)
 */
export function createClassicDice(count: number = 5): Die[] {
  return Array.from({ length: count }, () => createDie('d6'));
}

/**
 * Roll all dice for a player
 */
export function rollAllDice(dice: Die[]): Die[] {
  return dice.map(die => rerollDie(die));
}

/**
 * Count dice showing a specific face value
 * Includes wild 1s unless counting 1s specifically
 */
export function countDiceFace(dice: Die[], faceValue: number, includeWilds: boolean = true): number {
  let count = 0;
  for (const die of dice) {
    if (die.faceValue === faceValue) {
      count++;
    } else if (includeWilds && faceValue !== 1 && die.faceValue === 1) {
      // 1s are wild for all other values
      count++;
    }
  }
  return count;
}

/**
 * Count total dice showing a face value across all players
 */
export function countTotalDiceFace(
  allDice: Die[][],
  faceValue: number,
  includeWilds: boolean = true
): number {
  return allDice.reduce((total, playerDice) => {
    return total + countDiceFace(playerDice, faceValue, includeWilds);
  }, 0);
}

/**
 * Upgrade a die to the next size
 */
export function upgradeDie(die: Die): Die | null {
  const currentIndex = DICE_ORDER.indexOf(die.type);
  if (currentIndex >= DICE_ORDER.length - 1) {
    return null; // Already at max
  }
  return {
    ...die,
    type: DICE_ORDER[currentIndex + 1]
  };
}

/**
 * Downgrade a die to the previous size
 */
export function downgradeDie(die: Die): Die | null {
  const currentIndex = DICE_ORDER.indexOf(die.type);
  if (currentIndex <= 0) {
    return null; // Already at min
  }
  return {
    ...die,
    type: DICE_ORDER[currentIndex - 1]
  };
}

/**
 * Get probability of rolling a specific face on a die type
 */
export function getFaceProbability(dieType: DieType, faceValue: number): number {
  const faces = DICE_FACES[dieType];
  const count = faces.filter(f => f === faceValue).length;
  return count / faces.length;
}

/**
 * Get probability of a face value including wilds
 */
export function getEffectiveProbability(dieType: DieType, faceValue: number): number {
  if (faceValue === 1) {
    return getFaceProbability(dieType, 1);
  }
  return getFaceProbability(dieType, faceValue) + getFaceProbability(dieType, 1);
}

/**
 * Validate that a face value is valid (1-6)
 */
export function isValidFaceValue(faceValue: number): boolean {
  return Number.isInteger(faceValue) && faceValue >= 1 && faceValue <= 6;
}
