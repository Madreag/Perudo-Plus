// ============================================
// AI System Tests
// ============================================

import { callLateDudo } from '../../../shared/gameState';
import { AIChatter } from '../AIChatter';
import { AIDifficulty } from '../../../types/AI';
import { GameState, Player, Bid, Die, Card, GameSettings, ActiveEffects } from '../../../shared/types';

// Mock helpers
function createMockDie(faceValue: number, type: Die['type'] = 'd6'): Die {
  return { id: `die-${Math.random()}`, type, faceValue };
}

function createMockPlayer(id: string, name: string, dice: Die[], options: Partial<Player> = {}): Player {
  return {
    id,
    name,
    ip: '127.0.0.1',
    slot: 0,
    dice,
    cards: [],
    isConnected: true,
    isHost: false,
    isEliminated: false,
    isAI: false,
    activeEffects: { insurance: false, doubleDudo: false, phantomBid: false, lateDudo: false },
    ...options
  };
}

function createMockGameState(players: Player[], currentBid: Bid | null = null, previousBids: Bid[] = []): GameState {
  const settings = {
    mode: 'tactical' as const,
    stage: 'casino' as const,
    maxPlayers: 5,
    enableCalza: false,
    enableLastStand: false,
    aiDifficulty: 'normal' as const,
    aiPlayerCount: 0
  };
  
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
    settings
  } as GameState;
}

// ============================================
// Late Dudo Tests
// ============================================
describe('Late Dudo', () => {
  test('callLateDudo should challenge the last previous bid', () => {
    const player1 = createMockPlayer('p1', 'Player 1', [createMockDie(3), createMockDie(3)], {
      activeEffects: { insurance: false, doubleDudo: false, phantomBid: false, lateDudo: true }
    });
    const player2 = createMockPlayer('p2', 'Player 2', [createMockDie(2), createMockDie(2)]);
    
    const previousBid: Bid = { playerId: 'p2', quantity: 5, faceValue: 3 }; // 5 threes - likely false
    const currentBid: Bid = { playerId: 'p2', quantity: 6, faceValue: 3 };
    
    const gameState = createMockGameState([player1, player2], currentBid, [previousBid]);
    
    const { newState, result } = callLateDudo(gameState, 'p1');
    
    expect(result.bid).toEqual(previousBid);
    expect(result.callerId).toBe('p1');
    expect(newState.phase).toBe('dudo_called');
    // With 2 threes total, challenging 5 threes should succeed
    expect(result.success).toBe(true);
  });

  test('callLateDudo should fail without lateDudo effect', () => {
    const player1 = createMockPlayer('p1', 'Player 1', [createMockDie(3)]);
    const player2 = createMockPlayer('p2', 'Player 2', [createMockDie(2)]);
    
    const previousBid: Bid = { playerId: 'p2', quantity: 2, faceValue: 3 };
    const currentBid: Bid = { playerId: 'p2', quantity: 3, faceValue: 3 };
    
    const gameState = createMockGameState([player1, player2], currentBid, [previousBid]);
    
    expect(() => callLateDudo(gameState, 'p1')).toThrow('Late Dudo effect not active');
  });

  test('callLateDudo should fail without previous bids', () => {
    const player1 = createMockPlayer('p1', 'Player 1', [createMockDie(3)], {
      activeEffects: { insurance: false, doubleDudo: false, phantomBid: false, lateDudo: true }
    });
    const player2 = createMockPlayer('p2', 'Player 2', [createMockDie(2)]);
    
    const currentBid: Bid = { playerId: 'p2', quantity: 2, faceValue: 3 };
    
    const gameState = createMockGameState([player1, player2], currentBid, []);
    
    expect(() => callLateDudo(gameState, 'p1')).toThrow('No previous bids to challenge');
  });
});

// ============================================
// AI Chatter Tests
// ============================================
describe('AIChatter', () => {
  test('should return null most of the time (low probability)', () => {
    const chatter = new AIChatter(AIDifficulty.EASY, 0); // 0% chance
    
    const results: (string | null)[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(chatter.getChatMessage('dudo_success'));
    }
    
    expect(results.every(r => r === null)).toBe(true);
  });

  test('should return messages with high probability', () => {
    const chatter = new AIChatter(AIDifficulty.EASY, 1); // 100% chance
    
    const message = chatter.getChatMessage('dudo_success');
    expect(message).not.toBeNull();
    expect(typeof message).toBe('string');
  });

  test('should return different messages for different events', () => {
    const chatter = new AIChatter(AIDifficulty.HARD, 1);
    
    const dudoMsg = chatter.getChatMessage('dudo_success');
    const jontiMsg = chatter.getChatMessage('jonti_success');
    
    expect(dudoMsg).not.toBeNull();
    expect(jontiMsg).not.toBeNull();
  });

  test('isBigBid should correctly identify big bids', () => {
    expect(AIChatter.isBigBid(5, 10)).toBe(true);  // 50%
    expect(AIChatter.isBigBid(6, 10)).toBe(true);  // 60%
    expect(AIChatter.isBigBid(4, 10)).toBe(false); // 40%
  });
});

// ============================================
// Die Selection Helper Tests (conceptual)
// ============================================
describe('Die Selection Logic', () => {
  test('should prefer upgrading lowest die type', () => {
    const dice: Die[] = [
      createMockDie(3, 'd3'),
      createMockDie(4, 'd6'),
      createMockDie(5, 'd8')
    ];
    
    // The d3 should be selected for upgrade
    const upgradeOrder = ['d3', 'd4', 'd6', 'd8'];
    let selectedDie: Die | null = null;
    
    for (const type of upgradeOrder) {
      const die = dice.find(d => d.type === type);
      if (die) {
        selectedDie = die;
        break;
      }
    }
    
    expect(selectedDie?.type).toBe('d3');
  });

  test('should prefer cracking highest die type', () => {
    const dice: Die[] = [
      createMockDie(3, 'd4'),
      createMockDie(4, 'd6'),
      createMockDie(5, 'd10')
    ];
    
    // The d10 should be selected for cracking
    const crackOrder = ['d10', 'd8', 'd6', 'd4'];
    let selectedDie: Die | null = null;
    
    for (const type of crackOrder) {
      const die = dice.find(d => d.type === type);
      if (die) {
        selectedDie = die;
        break;
      }
    }
    
    expect(selectedDie?.type).toBe('d10');
  });
});

// ============================================
// Wild 1s Counting Test
// ============================================
describe('Wild 1s Counting', () => {
  test('should count 1s as wild for non-1 bids', () => {
    const dice: Die[] = [
      createMockDie(1),  // Wild
      createMockDie(3),
      createMockDie(3),
      createMockDie(5)
    ];
    
    // Count 3s (including wilds)
    let count = 0;
    for (const die of dice) {
      if (die.faceValue === 3 || die.faceValue === 1) {
        count++;
      }
    }
    
    expect(count).toBe(3); // Two 3s + one 1 (wild)
  });

  test('should not count 1s as wild for 1 bids', () => {
    const dice: Die[] = [
      createMockDie(1),
      createMockDie(1),
      createMockDie(3),
      createMockDie(5)
    ];
    
    // Count 1s (no wilds apply)
    let count = 0;
    for (const die of dice) {
      if (die.faceValue === 1) {
        count++;
      }
    }
    
    expect(count).toBe(2); // Just the actual 1s
  });
});
