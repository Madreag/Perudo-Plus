// ============================================
// AI Chatter Module - Personality for AI Players
// Sends thematic chat messages after significant actions
// ============================================

import { AIDifficulty } from '../../types/AI';

// Chat message templates by difficulty and event type
const CHAT_MESSAGES: Record<AIDifficulty, Record<string, string[]>> = {
  [AIDifficulty.EASY]: {
    dudo_success: [
      "*hic* I knew it!",
      "Woohoo! Lucky guess!",
      "Even a broken clock... *burp*",
      "Ha! Didn't see that coming, did ya?",
      "I'm on fire! ...wait, am I actually on fire?"
    ],
    dudo_fail: [
      "Oops... my bad!",
      "*hic* Worth a shot...",
      "The room is spinning...",
      "I blame the tequila",
      "That dice looked different a second ago"
    ],
    jonti_success: [
      "WOOO! Nailed it!",
      "*hic* I'm a genius!",
      "Even drunk me is pretty good!",
      "Did NOT expect that to work!"
    ],
    jonti_fail: [
      "That was... ambitious",
      "*hic* Close enough?",
      "Math is hard when the numbers keep moving"
    ],
    big_bid: [
      "Hold my drink...",
      "YOLO!",
      "Go big or go home! ...where IS home?"
    ],
    card_played: [
      "Ooh, shiny card!",
      "What does this do again?",
      "*plays card upside down*"
    ]
  },
  
  [AIDifficulty.NORMAL]: {
    dudo_success: [
      "Called it!",
      "Had a feeling about that one",
      "The math checks out",
      "Nice try though!"
    ],
    dudo_fail: [
      "Well, that didn't work out",
      "Should've trusted my gut",
      "Fair play to you"
    ],
    jonti_success: [
      "Perfect read!",
      "Exactly as I thought",
      "Calculated!"
    ],
    jonti_fail: [
      "Risky move didn't pay off",
      "Can't win them all"
    ],
    big_bid: [
      "Feeling confident here",
      "Let's see if you buy it"
    ],
    card_played: [
      "Let's shake things up",
      "Time for a twist"
    ]
  },
  
  [AIDifficulty.HARD]: {
    dudo_success: [
      "Probability favored that outcome",
      "As the numbers predicted",
      "Statistical analysis confirmed"
    ],
    dudo_fail: [
      "Variance is cruel sometimes",
      "The unlikely outcome occurred",
      "Recalculating..."
    ],
    jonti_success: [
      "Precise calculation pays off",
      "Expected value maximized"
    ],
    jonti_fail: [
      "Low probability event, but calculated risk",
      "The variance caught up with me"
    ],
    big_bid: [
      "According to my calculations...",
      "The probability distribution supports this"
    ],
    card_played: [
      "Optimal card selection",
      "Maximizing expected value"
    ]
  },
  
  [AIDifficulty.CHUCK_NORRIS]: {
    dudo_success: [
      "The simulation predicted this",
      "50,000 iterations confirmed",
      "Nash equilibrium achieved"
    ],
    dudo_fail: [
      "Interesting... updating models",
      "Rare branch in the game tree",
      "Noted for future simulations"
    ],
    jonti_success: [
      "Monte Carlo approved",
      "Tree search found this line"
    ],
    jonti_fail: [
      "Acceptable variance",
      "EV was positive, result was not"
    ],
    big_bid: [
      "UCB1 selected this action",
      "Deep analysis supports this bid"
    ],
    card_played: [
      "Simulated thousands of outcomes",
      "Card EV maximization"
    ]
  }
};

export type ChatEventType = 'dudo_success' | 'dudo_fail' | 'jonti_success' | 'jonti_fail' | 'big_bid' | 'card_played';

/**
 * AI Chatter class - generates personality-based chat messages
 */
export class AIChatter {
  private readonly difficulty: AIDifficulty;
  private readonly chatProbability: number;
  
  constructor(difficulty: AIDifficulty, chatProbability: number = 0.15) {
    this.difficulty = difficulty;
    this.chatProbability = chatProbability;
  }
  
  /**
   * Get a chat message for an event, or null if AI doesn't chat this time
   */
  public getChatMessage(eventType: ChatEventType): string | null {
    // Only chat with certain probability to avoid spam
    if (Math.random() > this.chatProbability) {
      return null;
    }
    
    const messages = CHAT_MESSAGES[this.difficulty]?.[eventType];
    if (!messages || messages.length === 0) {
      return null;
    }
    
    // Pick a random message
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  /**
   * Check if a bid is "big" relative to total dice
   */
  public static isBigBid(bidQuantity: number, totalDiceCount: number): boolean {
    return bidQuantity >= totalDiceCount * 0.5;
  }
}

export default AIChatter;
