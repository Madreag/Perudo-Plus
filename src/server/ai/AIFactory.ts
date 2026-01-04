// ============================================
// AI Factory - Creates AI players with strategies
// ============================================

import { v4 as uuidv4 } from 'uuid';
import {
  AIDifficulty,
  AIStrategy,
  AIDecision,
  AIGameContext,
  AIPlayerInfo,
  KnownDiceInfo,
  AI_DIFFICULTY_NAMES
} from '../../types/AI';
import { Player, Die, Card, Bid, DieType, GameState, ActiveEffects } from '../../shared/types';
import { EasyStrategy } from './strategies/EasyStrategy';
import { NormalStrategy } from './strategies/NormalStrategy';
import { HardStrategy } from './strategies/HardStrategy';
import { ChuckNorrisStrategy } from './strategies/ChuckNorrisStrategy';

/**
 * AI Player class that wraps a strategy and provides player-like interface
 */
export class AIPlayer {
  public readonly id: string;
  public readonly name: string;
  public readonly difficulty: AIDifficulty;
  public readonly isAI: boolean = true;
  
  private strategy: AIStrategy;
  private knownDice: KnownDiceInfo[] = [];

  constructor(name: string, difficulty: AIDifficulty) {
    this.id = uuidv4();
    this.name = name;
    this.difficulty = difficulty;
    this.strategy = AIFactory.createStrategy(difficulty);
  }

  /**
   * Make a decision based on the current game state
   */
  public async makeDecision(gameState: GameState, playerId: string): Promise<AIDecision> {
    const context = this.buildContext(gameState, playerId);
    return this.strategy.makeDecision(context);
  }

  /**
   * Build AI context from game state
   */
  private buildContext(gameState: GameState, playerId: string): AIGameContext {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('AI player not found in game state');
    }

    // Get all players' public info
    const players: AIPlayerInfo[] = gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      diceCount: p.dice.length,
      cardCount: p.cards.length,
      isEliminated: p.isEliminated,
      slot: p.slot
    }));

    // Calculate total dice and unknown dice types
    const totalDiceCount = gameState.players
      .filter(p => !p.isEliminated)
      .reduce((sum, p) => sum + p.dice.length, 0);

    // Get unknown dice types (all dice except our own)
    const unknownDiceTypes: DieType[] = [];
    for (const p of gameState.players) {
      if (p.id !== playerId && !p.isEliminated) {
        for (const die of p.dice) {
          unknownDiceTypes.push(die.type);
        }
      }
    }

    // Get current turn player
    const activePlayers = gameState.players.filter(p => !p.isEliminated && p.dice.length > 0);
    const currentTurnPlayer = activePlayers[gameState.currentTurnIndex % activePlayers.length];

    return {
      ownDice: player.dice,
      ownCards: player.cards,
      ownPlayerId: playerId,
      currentBid: gameState.currentBid,
      previousBids: gameState.previousBids,
      roundNumber: gameState.roundNumber,
      players,
      currentTurnPlayerId: currentTurnPlayer?.id || playerId,
      totalDiceCount,
      unknownDiceTypes,
      knownDice: this.knownDice.filter(k => k.roundNumber === gameState.roundNumber),
      opponentModels: new Map()
    };
  }

  /**
   * Add known dice information (from Peek card, etc.)
   */
  public addKnownDice(info: KnownDiceInfo): void {
    this.knownDice.push(info);
  }

  /**
   * Clear known dice for new round
   */
  public clearKnownDice(): void {
    this.knownDice = [];
  }

  /**
   * Update opponent models after round end
   */
  public updateModels(gameState: GameState, playerId: string, dudoResult?: any): void {
    if (this.strategy.updateModels) {
      const context = this.buildContext(gameState, playerId);
      this.strategy.updateModels(context, dudoResult);
    }
  }

  /**
   * Reset strategy for new game
   */
  public reset(): void {
    this.strategy.reset();
    this.knownDice = [];
  }

  /**
   * Get strategy name
   */
  public getStrategyName(): string {
    return this.strategy.name;
  }
}

/**
 * Factory for creating AI strategies and players
 */
export class AIFactory {
  private static aiCounter = 0;

  /**
   * Create an AI strategy based on difficulty
   */
  public static createStrategy(difficulty: AIDifficulty): AIStrategy {
    switch (difficulty) {
      case AIDifficulty.EASY:
        return new EasyStrategy();
      case AIDifficulty.NORMAL:
        return new NormalStrategy();
      case AIDifficulty.HARD:
        return new HardStrategy();
      case AIDifficulty.CHUCK_NORRIS:
        return new ChuckNorrisStrategy();
      default:
        return new NormalStrategy();
    }
  }

  /**
   * Create an AI player with a generated name
   */
  public static createAIPlayer(difficulty: AIDifficulty, customName?: string): AIPlayer {
    const name = customName || this.generateAIName(difficulty);
    return new AIPlayer(name, difficulty);
  }

  /**
   * Generate a name for an AI player based on difficulty
   */
  private static generateAIName(difficulty: AIDifficulty): string {
    this.aiCounter++;
    
    const easyNames = ['Tipsy Tim', 'Wobbly Walter', 'Dizzy Dave', 'Stumbling Steve', 'Groggy Greg'];
    const normalNames = ['Casual Carl', 'Regular Rick', 'Average Andy', 'Standard Stan', 'Typical Tom'];
    const hardNames = ['Professor Pi', 'Dr. Probability', 'Stats Master', 'The Calculator', 'Odds Oracle'];
    const chuckNames = ['Chuck Norris', 'The Terminator', 'Deep Blue', 'AlphaPerudo', 'The Machine'];

    let names: string[];
    switch (difficulty) {
      case AIDifficulty.EASY:
        names = easyNames;
        break;
      case AIDifficulty.NORMAL:
        names = normalNames;
        break;
      case AIDifficulty.HARD:
        names = hardNames;
        break;
      case AIDifficulty.CHUCK_NORRIS:
        names = chuckNames;
        break;
      default:
        names = normalNames;
    }

    const baseName = names[this.aiCounter % names.length];
    return `${baseName} [AI]`;
  }

  /**
   * Create a Player object from an AIPlayer for game state
   */
  public static createPlayerFromAI(aiPlayer: AIPlayer, slot: number | null = null): Player {
    return {
      id: aiPlayer.id,
      name: aiPlayer.name,
      ip: 'AI',
      slot,
      dice: [],
      cards: [],
      isConnected: true,
      isHost: false,
      isEliminated: false,
      isAI: true,
      activeEffects: {
        insurance: false,
        doubleDudo: false,
        phantomBid: false,
        lateDudo: false
      }
    };
  }

  /**
   * Get all available difficulties
   */
  public static getAvailableDifficulties(): { value: AIDifficulty; name: string }[] {
    return [
      { value: AIDifficulty.EASY, name: AI_DIFFICULTY_NAMES[AIDifficulty.EASY] },
      { value: AIDifficulty.NORMAL, name: AI_DIFFICULTY_NAMES[AIDifficulty.NORMAL] },
      { value: AIDifficulty.HARD, name: AI_DIFFICULTY_NAMES[AIDifficulty.HARD] },
      { value: AIDifficulty.CHUCK_NORRIS, name: AI_DIFFICULTY_NAMES[AIDifficulty.CHUCK_NORRIS] }
    ];
  }

  /**
   * Parse difficulty from string
   */
  public static parseDifficulty(value: string): AIDifficulty {
    switch (value.toLowerCase()) {
      case 'easy':
        return AIDifficulty.EASY;
      case 'normal':
        return AIDifficulty.NORMAL;
      case 'hard':
        return AIDifficulty.HARD;
      case 'chuck_norris':
      case 'chucknorris':
      case 'chuck':
        return AIDifficulty.CHUCK_NORRIS;
      default:
        return AIDifficulty.NORMAL;
    }
  }
}

export default AIFactory;
