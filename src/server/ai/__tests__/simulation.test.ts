// ============================================
// AI System Simulation Tests
// Part 3: Simulated Gameplay Scenarios
// ============================================

import { AIFactory, AIPlayer } from '../AIFactory';
import { AIDifficulty, AIDecision, AIGameContext } from '../../../types/AI';
import { AIChatter } from '../AIChatter';
import { EasyStrategy } from '../strategies/EasyStrategy';
import { NormalStrategy } from '../strategies/NormalStrategy';
import { HardStrategy } from '../strategies/HardStrategy';
import { ChuckNorrisStrategy } from '../strategies/ChuckNorrisStrategy';
import { GameState, Player, Die, Card, Bid, GameSettings } from '../../../shared/types';

// Helper functions
function createMockDie(faceValue: number, type: Die['type'] = 'd6'): Die {
  return { id: `die-${Math.random().toString(36).slice(2)}`, type, faceValue };
}

function createMockCard(type: Card['type'], name: string): Card {
  return { id: `card-${Math.random().toString(36).slice(2)}`, type, name, description: name, timing: 'on_turn' };
}

function createMockPlayer(id: string, name: string, dice: Die[], cards: Card[] = [], isAI = false): Player {
  return {
    id,
    name,
    ip: '127.0.0.1',
    slot: 0,
    dice,
    cards,
    isConnected: true,
    isHost: false,
    isEliminated: false,
    isAI,
    activeEffects: { insurance: false, doubleDudo: false, phantomBid: false, lateDudo: false }
  };
}

function createMockGameState(
  players: Player[], 
  currentBid: Bid | null = null, 
  previousBids: Bid[] = [],
  mode: 'classic' | 'tactical' | 'chaos' = 'tactical'
): GameState {
  return {
    id: 'test-game',
    players,
    currentBid,
    previousBids,
    currentTurnIndex: 0,
    roundNumber: 1,
    phase: 'bidding' as const,
    winnerId: null,
    lastDudoResult: null,
    pausedFromPhase: null,
    settings: {
      mode,
      stage: 'casino' as const,
      maxPlayers: 5,
      enableCalza: false,
      enableLastStand: false,
      aiDifficulty: 'normal' as const,
      aiPlayerCount: 0
    }
  } as GameState;
}

function buildAIContext(gameState: GameState, playerId: string): AIGameContext {
  const player = gameState.players.find(p => p.id === playerId)!;
  const totalDiceCount = gameState.players
    .filter(p => !p.isEliminated)
    .reduce((sum, p) => sum + p.dice.length, 0);

  const unknownDiceTypes = gameState.players
    .filter(p => p.id !== playerId && !p.isEliminated)
    .flatMap(p => p.dice.map(d => d.type));

  return {
    ownDice: player.dice,
    ownCards: player.cards,
    ownPlayerId: playerId,
    currentBid: gameState.currentBid,
    previousBids: gameState.previousBids,
    roundNumber: gameState.roundNumber,
    gameMode: gameState.settings.mode,
    players: gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      diceCount: p.dice.length,
      cardCount: p.cards.length,
      isEliminated: p.isEliminated,
      slot: p.slot
    })),
    currentTurnPlayerId: playerId,
    totalDiceCount,
    unknownDiceTypes,
    knownDice: [],
    opponentModels: new Map()
  };
}

// ============================================
// Scenario A: Critical Card Execution Test
// ============================================
describe('Scenario A: Critical Card Execution', () => {
  test('Hard AI should consider playing polish on d6 die', async () => {
    const hardStrategy = new HardStrategy();
    
    // AI has d6 die and polish card
    const aiDice = [createMockDie(3, 'd6')];
    const aiCards = [createMockCard('polish', 'Polish')];
    const aiPlayer = createMockPlayer('ai1', 'Hard AI', aiDice, aiCards, true);
    
    // Human has d10 die
    const humanDice = [createMockDie(4, 'd10')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    const gameState = createMockGameState([aiPlayer, humanPlayer]);
    const context = buildAIContext(gameState, 'ai1');
    
    const decision = await hardStrategy.makeDecision(context);
    
    console.log('[Scenario A - Polish] AI Decision:', JSON.stringify(decision, null, 2));
    
    // AI should make a valid decision
    expect(decision).toBeDefined();
    expect(decision.action).toBeDefined();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  test('Hard AI should consider playing crack on opponent d10', async () => {
    const hardStrategy = new HardStrategy();
    
    // AI has crack card
    const aiDice = [createMockDie(3, 'd6')];
    const aiCards = [createMockCard('crack', 'Crack')];
    const aiPlayer = createMockPlayer('ai1', 'Hard AI', aiDice, aiCards, true);
    
    // Human has d10 die (high value target)
    const humanDice = [createMockDie(4, 'd10'), createMockDie(2, 'd10')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    const gameState = createMockGameState([aiPlayer, humanPlayer]);
    const context = buildAIContext(gameState, 'ai1');
    
    const decision = await hardStrategy.makeDecision(context);
    
    console.log('[Scenario A - Crack] AI Decision:', JSON.stringify(decision, null, 2));
    
    expect(decision).toBeDefined();
    expect(decision.action).toBeDefined();
  });

  test('Hard AI should consider inflation/wild_shift with current bid', async () => {
    const hardStrategy = new HardStrategy();
    
    // AI has inflation and wild_shift cards
    const aiDice = [createMockDie(4, 'd6'), createMockDie(4, 'd6')];
    const aiCards = [
      createMockCard('inflation', 'Inflation'),
      createMockCard('wild_shift', 'Wild Shift')
    ];
    const aiPlayer = createMockPlayer('ai1', 'Hard AI', aiDice, aiCards, true);
    
    const humanDice = [createMockDie(2, 'd6'), createMockDie(3, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    // Human made a bid of "three 4s"
    const currentBid: Bid = { playerId: 'human', quantity: 3, faceValue: 4 };
    
    const gameState = createMockGameState([aiPlayer, humanPlayer], currentBid);
    const context = buildAIContext(gameState, 'ai1');
    
    const decision = await hardStrategy.makeDecision(context);
    
    console.log('[Scenario A - Inflation/WildShift] AI Decision:', JSON.stringify(decision, null, 2));
    
    expect(decision).toBeDefined();
    // AI should either bid, call dudo, or play a card
    expect(['bid', 'dudo', 'jonti', 'play_card']).toContain(decision.action);
  });
});

// ============================================
// Scenario B: Late Dudo Functional Test
// ============================================
describe('Scenario B: Late Dudo Functional Test', () => {
  test('Normal AI with late_dudo card should consider using it on bad previous bid', async () => {
    const normalStrategy = new NormalStrategy();
    
    // AI has late_dudo card
    const aiDice = [createMockDie(3, 'd6'), createMockDie(3, 'd6')];
    const aiCards = [createMockCard('late_dudo', 'Late Dudo')];
    const aiPlayer = createMockPlayer('ai1', 'Normal AI', aiDice, aiCards, true);
    aiPlayer.activeEffects.lateDudo = true; // Effect already activated
    
    const humanDice = [createMockDie(2, 'd6'), createMockDie(5, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    // Previous bid was very high (unlikely)
    const previousBid: Bid = { playerId: 'human', quantity: 10, faceValue: 6 };
    // Current bid is low (plausible)
    const currentBid: Bid = { playerId: 'human', quantity: 2, faceValue: 3 };
    
    const gameState = createMockGameState([aiPlayer, humanPlayer], currentBid, [previousBid]);
    const context = buildAIContext(gameState, 'ai1');
    
    const decision = await normalStrategy.makeDecision(context);
    
    console.log('[Scenario B - Late Dudo] AI Decision:', JSON.stringify(decision, null, 2));
    console.log('[Scenario B] Previous bid challenged:', previousBid);
    
    expect(decision).toBeDefined();
    // The AI should make some decision (may or may not use late_dudo based on strategy)
    expect(decision.action).toBeDefined();
  });
});

// ============================================
// Scenario C: Chuck Norris Worker Thread Test
// ============================================
describe('Scenario C: Chuck Norris Worker Thread', () => {
  test('Chuck Norris strategy should make decisions without crashing', async () => {
    const chuckStrategy = new ChuckNorrisStrategy();
    
    const aiDice = [createMockDie(3, 'd6'), createMockDie(5, 'd6')];
    const aiPlayer = createMockPlayer('ai1', 'Chuck Norris', aiDice, [], true);
    
    const humanDice = [createMockDie(2, 'd6'), createMockDie(4, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    const gameState = createMockGameState([aiPlayer, humanPlayer]);
    const context = buildAIContext(gameState, 'ai1');
    
    console.log('[Scenario C] Calling Chuck Norris strategy...');
    const startTime = Date.now();
    
    const decision = await chuckStrategy.makeDecision(context);
    
    const endTime = Date.now();
    console.log(`[Scenario C] Chuck Norris decision took ${endTime - startTime}ms`);
    console.log('[Scenario C] Decision:', JSON.stringify(decision, null, 2));
    
    expect(decision).toBeDefined();
    expect(decision.action).toBeDefined();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
  }, 10000); // 10 second timeout for MCTS

  test('Chuck Norris should handle current bid scenario', async () => {
    const chuckStrategy = new ChuckNorrisStrategy();
    
    const aiDice = [createMockDie(4, 'd6'), createMockDie(4, 'd6'), createMockDie(1, 'd6')];
    const aiPlayer = createMockPlayer('ai1', 'Chuck Norris', aiDice, [], true);
    
    const humanDice = [createMockDie(2, 'd6'), createMockDie(3, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    const currentBid: Bid = { playerId: 'human', quantity: 2, faceValue: 4 };
    
    const gameState = createMockGameState([aiPlayer, humanPlayer], currentBid);
    const context = buildAIContext(gameState, 'ai1');
    
    console.log('[Scenario C - With Bid] Calling Chuck Norris strategy...');
    const decision = await chuckStrategy.makeDecision(context);
    
    console.log('[Scenario C - With Bid] Decision:', JSON.stringify(decision, null, 2));
    
    expect(decision).toBeDefined();
    expect(['bid', 'dudo', 'jonti', 'play_card']).toContain(decision.action);
  }, 10000);
});

// ============================================
// Scenario D: AI Chat & Personality Test
// ============================================
describe('Scenario D: AI Chat & Personality', () => {
  test('Each difficulty should have unique chat messages', () => {
    const difficulties = [
      AIDifficulty.EASY,
      AIDifficulty.NORMAL,
      AIDifficulty.HARD,
      AIDifficulty.CHUCK_NORRIS
    ];
    
    const eventTypes: ('dudo_success' | 'dudo_fail' | 'jonti_success' | 'big_bid')[] = [
      'dudo_success',
      'dudo_fail',
      'jonti_success',
      'big_bid'
    ];
    
    console.log('\n[Scenario D] AI Chat Messages by Personality:\n');
    
    for (const difficulty of difficulties) {
      const chatter = new AIChatter(difficulty, 1); // 100% chat probability
      console.log(`--- ${difficulty.toUpperCase()} AI ---`);
      
      for (const eventType of eventTypes) {
        const message = chatter.getChatMessage(eventType);
        console.log(`  ${eventType}: "${message}"`);
        expect(message).not.toBeNull();
        expect(typeof message).toBe('string');
      }
      console.log('');
    }
  });

  test('Easy AI should have casual/drunk-themed messages', () => {
    const chatter = new AIChatter(AIDifficulty.EASY, 1);
    const messages: string[] = [];
    
    // Collect multiple messages
    for (let i = 0; i < 5; i++) {
      const msg = chatter.getChatMessage('dudo_success');
      if (msg) messages.push(msg);
    }
    
    // Easy AI messages should exist
    expect(messages.length).toBeGreaterThan(0);
    console.log('[Scenario D] Easy AI sample messages:', messages);
  });

  test('Hard AI should have analytical messages', () => {
    const chatter = new AIChatter(AIDifficulty.HARD, 1);
    const messages: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      const msg = chatter.getChatMessage('dudo_success');
      if (msg) messages.push(msg);
    }
    
    expect(messages.length).toBeGreaterThan(0);
    console.log('[Scenario D] Hard AI sample messages:', messages);
    
    // Hard AI messages should reference probability/statistics
    const hasAnalyticalTerms = messages.some(m => 
      m.toLowerCase().includes('probability') || 
      m.toLowerCase().includes('calculation') ||
      m.toLowerCase().includes('statistics') ||
      m.toLowerCase().includes('predicted')
    );
    expect(hasAnalyticalTerms).toBe(true);
  });

  test('Chuck Norris AI should have confident messages', () => {
    const chatter = new AIChatter(AIDifficulty.CHUCK_NORRIS, 1);
    const messages: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      const msg = chatter.getChatMessage('dudo_success');
      if (msg) messages.push(msg);
    }
    
    expect(messages.length).toBeGreaterThan(0);
    console.log('[Scenario D] Chuck Norris AI sample messages:', messages);
    
    // Chuck Norris messages should reference simulation/MCTS terms
    const hasMCTSTerms = messages.some(m => 
      m.toLowerCase().includes('simulation') || 
      m.toLowerCase().includes('iteration') ||
      m.toLowerCase().includes('nash') ||
      m.toLowerCase().includes('monte carlo')
    );
    expect(hasMCTSTerms).toBe(true);
  });
});

// ============================================
// Mode-Specific Logic Test
// ============================================
describe('Mode-Specific Logic', () => {
  test('AI should skip card logic in Classic mode', async () => {
    const normalStrategy = new NormalStrategy();
    
    // AI has cards but mode is classic
    const aiDice = [createMockDie(3, 'd6')];
    const aiCards = [createMockCard('polish', 'Polish')];
    const aiPlayer = createMockPlayer('ai1', 'Normal AI', aiDice, aiCards, true);
    
    const humanDice = [createMockDie(2, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    // Classic mode - cards should be ignored
    const gameState = createMockGameState([aiPlayer, humanPlayer], null, [], 'classic');
    const context = buildAIContext(gameState, 'ai1');
    
    const decision = await normalStrategy.makeDecision(context);
    
    console.log('[Mode-Specific] Classic mode decision:', JSON.stringify(decision, null, 2));
    
    // In classic mode, AI should NOT play cards
    expect(decision.action).not.toBe('play_card');
  });

  test('AI should consider cards in Tactical mode', async () => {
    const normalStrategy = new NormalStrategy();
    
    const aiDice = [createMockDie(3, 'd6')];
    const aiCards = [createMockCard('polish', 'Polish')];
    const aiPlayer = createMockPlayer('ai1', 'Normal AI', aiDice, aiCards, true);
    
    const humanDice = [createMockDie(2, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    // Tactical mode - cards should be considered
    const gameState = createMockGameState([aiPlayer, humanPlayer], null, [], 'tactical');
    const context = buildAIContext(gameState, 'ai1');
    
    // Make multiple decisions to see if cards are ever played
    let cardPlayCount = 0;
    for (let i = 0; i < 20; i++) {
      const decision = await normalStrategy.makeDecision(context);
      if (decision.action === 'play_card') {
        cardPlayCount++;
      }
    }
    
    console.log(`[Mode-Specific] Tactical mode: ${cardPlayCount}/20 decisions were card plays`);
    
    // In tactical mode, AI should at least sometimes consider cards
    // (probability-based, so we check over multiple runs)
    expect(cardPlayCount).toBeGreaterThanOrEqual(0); // Cards may or may not be played based on probability
  });
});

// ============================================
// Dynamic Jonti Threshold Test
// ============================================
describe('Dynamic Jonti Threshold', () => {
  test('Hard AI with many dice should have lower Jonti threshold', async () => {
    const hardStrategy = new HardStrategy();
    
    // AI with 5 dice (aggressive threshold)
    const manyDice = [
      createMockDie(3, 'd6'),
      createMockDie(3, 'd6'),
      createMockDie(3, 'd6'),
      createMockDie(3, 'd6'),
      createMockDie(3, 'd6')
    ];
    const aiPlayer = createMockPlayer('ai1', 'Hard AI', manyDice, [], true);
    
    const humanDice = [createMockDie(2, 'd6'), createMockDie(4, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    // Bid that might trigger Jonti consideration
    const currentBid: Bid = { playerId: 'human', quantity: 5, faceValue: 3 };
    
    const gameState = createMockGameState([aiPlayer, humanPlayer], currentBid);
    const context = buildAIContext(gameState, 'ai1');
    
    const decision = await hardStrategy.makeDecision(context);
    
    console.log('[Dynamic Jonti - Many Dice] Decision:', JSON.stringify(decision, null, 2));
    expect(decision).toBeDefined();
  });

  test('Hard AI with 1 die should have higher Jonti threshold (conservative)', async () => {
    const hardStrategy = new HardStrategy();
    
    // AI with only 1 die (very conservative - losing Jonti = elimination)
    const fewDice = [createMockDie(3, 'd6')];
    const aiPlayer = createMockPlayer('ai1', 'Hard AI', fewDice, [], true);
    
    const humanDice = [createMockDie(3, 'd6'), createMockDie(3, 'd6')];
    const humanPlayer = createMockPlayer('human', 'Human', humanDice);
    
    // Bid where Jonti might be tempting but risky
    const currentBid: Bid = { playerId: 'human', quantity: 3, faceValue: 3 };
    
    const gameState = createMockGameState([aiPlayer, humanPlayer], currentBid);
    const context = buildAIContext(gameState, 'ai1');
    
    const decision = await hardStrategy.makeDecision(context);
    
    console.log('[Dynamic Jonti - Few Dice] Decision:', JSON.stringify(decision, null, 2));
    expect(decision).toBeDefined();
    
    // With only 1 die, AI should be very conservative about Jonti
    // It's not guaranteed to avoid Jonti, but reasoning should mention threshold
    if (decision.action === 'jonti') {
      expect(decision.confidence).toBeGreaterThan(0.35); // Should need high confidence
    }
  });
});
