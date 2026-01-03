// ============================================
// Perudo+ Card System Module
// ============================================

import { v4 as uuidv4 } from 'uuid';
import { Card, CardType, CardTiming } from './types';

// Card definitions
export const CARD_DEFINITIONS: Record<CardType, Omit<Card, 'id'>> = {
  // Information Cards
  peek: {
    type: 'peek',
    name: 'Peek',
    description: 'Privately view one die (size + face) of another player.',
    timing: 'on_turn'
  },
  gauge: {
    type: 'gauge',
    name: 'Gauge',
    description: 'View the sizes (not faces) of two dice from any players.',
    timing: 'on_turn'
  },
  false_tell: {
    type: 'false_tell',
    name: 'False Tell',
    description: 'Announce you peeked at a die (even if you didn\'t). Bluff tool.',
    timing: 'any'
  },

  // Bid Manipulation Cards
  inflation: {
    type: 'inflation',
    name: 'Inflation',
    description: 'Increase the current bid by +1 quantity automatically.',
    timing: 'reaction'
  },
  wild_shift: {
    type: 'wild_shift',
    name: 'Wild Shift',
    description: 'Change the face value of the current bid (quantity unchanged).',
    timing: 'reaction'
  },
  phantom_bid: {
    type: 'phantom_bid',
    name: 'Phantom Bid',
    description: 'Make a legal bid ignoring normal increment rules.',
    timing: 'on_turn'
  },

  // Dudo Interaction Cards
  insurance: {
    type: 'insurance',
    name: 'Insurance',
    description: 'If your Dudo fails, you lose no dice this round.',
    timing: 'on_dudo'
  },
  double_dudo: {
    type: 'double_dudo',
    name: 'Double Dudo',
    description: 'If correct, opponent loses 2 dice; if wrong, you lose 2.',
    timing: 'on_dudo'
  },
  late_dudo: {
    type: 'late_dudo',
    name: 'Late Dudo',
    description: 'Call Dudo on a previous bid, not just the current one.',
    timing: 'on_turn'
  },

  // Dice Manipulation Cards (Rare)
  reroll_one: {
    type: 'reroll_one',
    name: 'Re-roll One',
    description: 'Re-roll one of your own dice.',
    timing: 'on_turn'
  },
  blind_swap: {
    type: 'blind_swap',
    name: 'Blind Swap',
    description: 'Swap one of your hidden dice with a random die from another player.',
    timing: 'on_turn'
  },
  polish: {
    type: 'polish',
    name: 'Polish',
    description: 'Upgrade one of your dice (d4→d6, d6→d8, etc).',
    timing: 'on_turn'
  },
  crack: {
    type: 'crack',
    name: 'Crack',
    description: 'Downgrade one of an opponent\'s dice.',
    timing: 'on_turn'
  }
};

// Card rarity/frequency in deck
export const CARD_FREQUENCY: Record<CardType, number> = {
  // Information Cards (common)
  peek: 4,
  gauge: 3,
  false_tell: 2,

  // Bid Manipulation Cards (uncommon)
  inflation: 3,
  wild_shift: 2,
  phantom_bid: 2,

  // Dudo Interaction Cards (uncommon)
  insurance: 3,
  double_dudo: 2,
  late_dudo: 2,

  // Dice Manipulation Cards (rare)
  reroll_one: 2,
  blind_swap: 1,
  polish: 1,
  crack: 1
};

// Chaos mode has more dice manipulation cards
export const CHAOS_CARD_FREQUENCY: Record<CardType, number> = {
  ...CARD_FREQUENCY,
  reroll_one: 4,
  blind_swap: 3,
  polish: 2,
  crack: 2
};

/**
 * Create a card instance from a card type
 */
export function createCard(cardType: CardType): Card {
  const definition = CARD_DEFINITIONS[cardType];
  return {
    id: uuidv4(),
    ...definition
  };
}

/**
 * Create a shuffled deck of cards
 */
export function createDeck(chaosMode: boolean = false): Card[] {
  const frequency = chaosMode ? CHAOS_CARD_FREQUENCY : CARD_FREQUENCY;
  const deck: Card[] = [];

  for (const [cardType, count] of Object.entries(frequency)) {
    for (let i = 0; i < count; i++) {
      deck.push(createCard(cardType as CardType));
    }
  }

  return shuffleDeck(deck);
}

/**
 * Shuffle a deck of cards (Fisher-Yates algorithm)
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Draw a card from the deck
 */
export function drawCard(deck: Card[]): { card: Card | null; remainingDeck: Card[] } {
  if (deck.length === 0) {
    return { card: null, remainingDeck: [] };
  }
  const [card, ...remainingDeck] = deck;
  return { card, remainingDeck };
}

/**
 * Check if a card can be played at the current timing
 */
export function canPlayCard(card: Card, currentTiming: CardTiming): boolean {
  if (card.timing === 'any') return true;
  return card.timing === currentTiming;
}

/**
 * Get cards that can be played at a specific timing
 */
export function getPlayableCards(cards: Card[], timing: CardTiming): Card[] {
  return cards.filter(card => canPlayCard(card, timing));
}

/**
 * Maximum hand size
 */
export const MAX_HAND_SIZE = 3;

/**
 * Check if player can draw a card
 */
export function canDrawCard(currentHandSize: number): boolean {
  return currentHandSize < MAX_HAND_SIZE;
}
