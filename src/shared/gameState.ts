// ============================================
// Perudo+ Game State Manager
// ============================================

import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  GameSettings,
  GamePhase,
  GameMode,
  Player,
  Bid,
  Card,
  Die,
  DudoResult,
  JontiResult,
  PublicGameState,
  PublicPlayerInfo,
  ActiveEffects
} from './types';
import {
  createStartingDice,
  createClassicDice,
  rollAllDice,
  countTotalDiceFace,
  rerollDie,
  upgradeDie,
  downgradeDie
} from './dice';
import {
  createDeck,
  drawCard,
  MAX_HAND_SIZE
} from './cards';

/**
 * Create default game settings
 */
export function createDefaultSettings(mode: GameMode = 'tactical'): GameSettings {
  return {
    mode,
    maxPlayers: 5,
    enableCalza: false,
    enableLastStand: false
  };
}

/**
 * Create a new player
 */
/**
 * Create default active effects (all false)
 */
export function createDefaultActiveEffects(): ActiveEffects {
  return {
    insurance: false,
    doubleDudo: false,
    phantomBid: false,
    lateDudo: false
  };
}

export function createPlayer(name: string, isHost: boolean = false): Player {
  return {
    id: uuidv4(),
    name,
    dice: [],
    cards: [],
    isConnected: true,
    isHost,
    isEliminated: false,
    activeEffects: createDefaultActiveEffects()
  };
}

/**
 * Create initial game state
 */
export function createGameState(settings: GameSettings = createDefaultSettings()): GameState {
  return {
    id: uuidv4(),
    phase: 'lobby',
    settings,
    players: [],
    currentTurnIndex: 0,
    currentBid: null,
    previousBids: [],
    roundNumber: 0,
    winnerId: null,
    lastDudoResult: null,
    pausedFromPhase: null
  };
}

/**
 * Add a player to the game
 */
export function addPlayer(state: GameState, player: Player): GameState {
  if (state.players.length >= state.settings.maxPlayers) {
    throw new Error('Game is full');
  }
  if (state.phase !== 'lobby') {
    throw new Error('Cannot join game in progress');
  }
  return {
    ...state,
    players: [...state.players, player]
  };
}

/**
 * Remove a player from the game
 */
export function removePlayer(state: GameState, playerId: string): GameState {
  return {
    ...state,
    players: state.players.filter(p => p.id !== playerId)
  };
}

/**
 * Initialize dice for all players based on game mode
 */
export function initializePlayerDice(state: GameState): GameState {
  const updatedPlayers = state.players.map(player => ({
    ...player,
    dice: state.settings.mode === 'classic' 
      ? createClassicDice(5)
      : createStartingDice()
  }));

  return {
    ...state,
    players: updatedPlayers
  };
}

/**
 * Start the game
 */
export function startGame(state: GameState): GameState {
  if (state.players.length < 2) {
    throw new Error('Need at least 2 players to start');
  }
  if (state.phase !== 'lobby') {
    throw new Error('Game already started');
  }

  let newState = initializePlayerDice(state);
  newState = {
    ...newState,
    phase: 'rolling',
    roundNumber: 1,
    currentTurnIndex: 0,
    currentBid: null,
    previousBids: []
  };

  return newState;
}

/**
 * Roll dice for all players (start of round)
 */
export function rollDiceForRound(state: GameState): GameState {
  const updatedPlayers = state.players.map(player => ({
    ...player,
    dice: rollAllDice(player.dice)
  }));

  return {
    ...state,
    players: updatedPlayers,
    phase: 'bidding'
  };
}

/**
 * Get active (non-eliminated) players
 */
export function getActivePlayers(state: GameState): Player[] {
  return state.players.filter(p => !p.isEliminated && p.dice.length > 0);
}

/**
 * Get current player
 */
export function getCurrentPlayer(state: GameState): Player | null {
  const activePlayers = getActivePlayers(state);
  if (activePlayers.length === 0) return null;
  return activePlayers[state.currentTurnIndex % activePlayers.length];
}

/**
 * Validate a bid
 */
export function isValidBid(state: GameState, bid: Bid, isPhantomBid: boolean = false): boolean {
  // Face value must be 1-6
  if (bid.faceValue < 1 || bid.faceValue > 6) return false;
  
  // Quantity must be positive
  if (bid.quantity < 1) return false;

  // If no current bid, any valid bid is allowed
  if (!state.currentBid) return true;

  // Phantom bid ignores increment rules
  if (isPhantomBid) return true;

  const current = state.currentBid;

  // Higher quantity is always valid
  if (bid.quantity > current.quantity) return true;

  // Same quantity requires higher face value
  if (bid.quantity === current.quantity && bid.faceValue > current.faceValue) return true;

  // Special rule: switching to/from 1s
  // Going to 1s: quantity must be at least half (rounded up)
  if (bid.faceValue === 1 && current.faceValue !== 1) {
    const minQuantity = Math.ceil(current.quantity / 2);
    return bid.quantity >= minQuantity;
  }

  // Going from 1s: quantity must be at least double + 1
  if (current.faceValue === 1 && bid.faceValue !== 1) {
    const minQuantity = current.quantity * 2 + 1;
    return bid.quantity >= minQuantity;
  }

  return false;
}

/**
 * Make a bid
 */
export function makeBid(state: GameState, playerId: string, quantity: number, faceValue: number): GameState {
  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer || currentPlayer.id !== playerId) {
    throw new Error('Not your turn');
  }

  // Check if player has phantom bid active
  const player = state.players.find(p => p.id === playerId);
  const isPhantomBid = player?.activeEffects?.phantomBid || false;

  const bid: Bid = { playerId, quantity, faceValue };
  if (!isValidBid(state, bid, isPhantomBid)) {
    throw new Error('Invalid bid');
  }

  const activePlayers = getActivePlayers(state);
  const nextTurnIndex = (state.currentTurnIndex + 1) % activePlayers.length;

  // Clear phantom bid effect after use
  let updatedState = state;
  if (isPhantomBid) {
    updatedState = setActiveEffect(state, playerId, 'phantomBid', false);
  }

  return {
    ...updatedState,
    currentBid: bid,
    previousBids: state.currentBid ? [...state.previousBids, state.currentBid] : [],
    currentTurnIndex: nextTurnIndex
  };
}

/**
 * Call Dudo (challenge the current bid)
 */
export function callDudo(state: GameState, callerId: string): { newState: GameState; result: DudoResult } {
  if (!state.currentBid) {
    throw new Error('No bid to challenge');
  }

  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer || currentPlayer.id !== callerId) {
    throw new Error('Not your turn');
  }

  const bid = state.currentBid;
  const bidder = state.players.find(p => p.id === bid.playerId);
  if (!bidder) {
    throw new Error('Bidder not found');
  }

  // Count all dice
  const allDice = getActivePlayers(state).map(p => p.dice);
  const actualCount = countTotalDiceFace(allDice, bid.faceValue, bid.faceValue !== 1);

  // Dudo is successful if actual count is LESS than bid quantity
  const dudoSuccess = actualCount < bid.quantity;
  const loserId = dudoSuccess ? bid.playerId : callerId;

  // Reveal all dice
  const revealedDice = getActivePlayers(state).map(p => ({
    playerId: p.id,
    dice: p.dice
  }));

  const result: DudoResult = {
    callerId,
    targetPlayerId: bid.playerId,
    bid,
    actualCount,
    success: dudoSuccess,
    loserId,
    revealedDice
  };

  const newState: GameState = {
    ...state,
    phase: 'dudo_called',
    lastDudoResult: result
  };

  return { newState, result };
}

/**
 * Call Jonti (claim the current bid is exactly correct)
 * If correct: caller gains a die back
 * If incorrect: caller loses a die
 */
export function callJonti(state: GameState, callerId: string): { newState: GameState; result: JontiResult } {
  if (!state.currentBid) {
    throw new Error('No bid to call Jonti on');
  }

  const currentPlayer = getCurrentPlayer(state);
  if (!currentPlayer || currentPlayer.id !== callerId) {
    throw new Error('Not your turn');
  }

  const bid = state.currentBid;

  // Count all dice
  const allDice = getActivePlayers(state).map(p => p.dice);
  const actualCount = countTotalDiceFace(allDice, bid.faceValue, bid.faceValue !== 1);

  // Jonti is successful if actual count EXACTLY equals bid quantity
  const jontiSuccess = actualCount === bid.quantity;

  // Reveal all dice
  const revealedDice = getActivePlayers(state).map(p => ({
    playerId: p.id,
    dice: p.dice
  }));

  const result: JontiResult = {
    callerId,
    bid,
    actualCount,
    success: jontiSuccess,
    revealedDice
  };

  const newState: GameState = {
    ...state,
    phase: 'dudo_called' // Reuse dudo_called phase for revealing dice
  };

  return { newState, result };
}

/**
 * Apply Jonti result (add or remove die from caller)
 */
export function applyJontiResult(
  state: GameState, 
  result: JontiResult
): { newState: GameState } {
  const updatedPlayers = state.players.map(player => {
    if (player.id === result.callerId) {
      if (result.success) {
        // Caller gains a die (add a d6)
        const newDie: Die = {
          id: uuidv4(),
          type: 'd6',
          faceValue: 1 // Will be rolled at start of next round
        };
        return {
          ...player,
          dice: [...player.dice, newDie]
        };
      } else {
        // Caller loses a die
        const newDice = player.dice.slice(1);
        return {
          ...player,
          dice: newDice,
          isEliminated: newDice.length === 0
        };
      }
    }
    return player;
  });

  // Check for winner
  const activePlayers = updatedPlayers.filter(p => !p.isEliminated);
  const winnerId = activePlayers.length === 1 ? activePlayers[0].id : null;

  const newState: GameState = {
    ...state,
    players: updatedPlayers,
    phase: winnerId ? 'game_over' : 'round_end',
    winnerId
  };

  return { newState };
}


/**
 * Apply Dudo result (remove die from loser)
 */
export function applyDudoResult(
  state: GameState, 
  result: DudoResult,
  insuranceUsed: boolean = false,
  doubleDudo: boolean = false
): { newState: GameState; cardDrawn: Card | null; deck: Card[] } {
  let deck = state.settings.mode !== 'classic' ? createDeck(state.settings.mode === 'chaos') : [];
  let cardDrawn: Card | null = null;

  // Determine dice to lose
  let diceLost = doubleDudo ? 2 : 1;
  if (insuranceUsed && result.loserId === result.callerId) {
    diceLost = 0;
  }

  const updatedPlayers = state.players.map(player => {
    if (player.id === result.loserId && diceLost > 0) {
      const newDice = player.dice.slice(diceLost);
      
      // Draw card if losing a die and hand not full
      if (state.settings.mode !== 'classic' && player.cards.length < MAX_HAND_SIZE) {
        const drawResult = drawCard(deck);
        if (drawResult.card) {
          cardDrawn = drawResult.card;
          deck = drawResult.remainingDeck;
          return {
            ...player,
            dice: newDice,
            cards: [...player.cards, drawResult.card],
            isEliminated: newDice.length === 0
          };
        }
      }

      return {
        ...player,
        dice: newDice,
        isEliminated: newDice.length === 0
      };
    }
    return player;
  });

  // Check for winner
  const activePlayers = updatedPlayers.filter(p => !p.isEliminated);
  const winnerId = activePlayers.length === 1 ? activePlayers[0].id : null;

  const newState: GameState = {
    ...state,
    players: updatedPlayers,
    phase: winnerId ? 'game_over' : 'round_end',
    winnerId
  };

  return { newState, cardDrawn, deck };
}

/**
 * Start a new round
 */
export function startNewRound(state: GameState): GameState {
  if (state.phase !== 'round_end') {
    throw new Error('Cannot start new round');
  }

  // Find the player who lost the last round to start
  const loserIndex = state.players.findIndex(
    p => p.id === state.lastDudoResult?.loserId && !p.isEliminated
  );
  
  const activePlayers = getActivePlayers(state);
  let startIndex = 0;
  if (loserIndex >= 0) {
    startIndex = activePlayers.findIndex(p => p.id === state.lastDudoResult?.loserId);
    if (startIndex < 0) startIndex = 0;
  }

  // Clear all active effects at the start of a new round
  const clearedState = clearAllActiveEffects(state);

  return {
    ...clearedState,
    phase: 'rolling',
    roundNumber: state.roundNumber + 1,
    currentTurnIndex: startIndex,
    currentBid: null,
    previousBids: [],
    lastDudoResult: null,
    pausedFromPhase: null
  };
}

/**
 * Convert game state to public state (hide private info)
 */
export function toPublicGameState(state: GameState): PublicGameState {
  const publicPlayers: PublicPlayerInfo[] = state.players.map(player => ({
    id: player.id,
    name: player.name,
    diceCount: player.dice.length,
    cardCount: player.cards.length,
    isConnected: player.isConnected,
    isHost: player.isHost,
    isEliminated: player.isEliminated,
    activeEffects: player.activeEffects
  }));

  return {
    id: state.id,
    phase: state.phase,
    settings: state.settings,
    players: publicPlayers,
    currentTurnIndex: state.currentTurnIndex,
    currentBid: state.currentBid,
    previousBids: state.previousBids,
    roundNumber: state.roundNumber,
    winnerId: state.winnerId,
    lastDudoResult: state.lastDudoResult,
    pausedFromPhase: state.pausedFromPhase
  };
}

/**
 * Apply card effect: Re-roll one die
 */
export function applyRerollOne(state: GameState, playerId: string, dieId: string): GameState {
  const updatedPlayers = state.players.map(player => {
    if (player.id === playerId) {
      const updatedDice = player.dice.map(die => 
        die.id === dieId ? rerollDie(die) : die
      );
      return { ...player, dice: updatedDice };
    }
    return player;
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Apply card effect: Polish (upgrade die)
 */
export function applyPolish(state: GameState, playerId: string, dieId: string): GameState {
  const updatedPlayers = state.players.map(player => {
    if (player.id === playerId) {
      const updatedDice = player.dice.map(die => {
        if (die.id === dieId) {
          const upgraded = upgradeDie(die);
          return upgraded || die;
        }
        return die;
      });
      return { ...player, dice: updatedDice };
    }
    return player;
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Apply card effect: Crack (downgrade opponent's die)
 */
export function applyCrack(state: GameState, targetPlayerId: string, dieId: string): GameState {
  const updatedPlayers = state.players.map(player => {
    if (player.id === targetPlayerId) {
      const updatedDice = player.dice.map(die => {
        if (die.id === dieId) {
          const downgraded = downgradeDie(die);
          return downgraded || die;
        }
        return die;
      });
      return { ...player, dice: updatedDice };
    }
    return player;
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Apply card effect: Inflation (+1 to current bid quantity)
 */
export function applyInflation(state: GameState): GameState {
  if (!state.currentBid) {
    throw new Error('No current bid to inflate');
  }

  return {
    ...state,
    currentBid: {
      ...state.currentBid,
      quantity: state.currentBid.quantity + 1
    }
  };
}

/**
 * Apply card effect: Wild Shift (change bid face value)
 */
export function applyWildShift(state: GameState, newFaceValue: number): GameState {
  if (!state.currentBid) {
    throw new Error('No current bid to shift');
  }
  if (newFaceValue < 1 || newFaceValue > 6) {
    throw new Error('Invalid face value');
  }

  return {
    ...state,
    currentBid: {
      ...state.currentBid,
      faceValue: newFaceValue
    }
  };
}

/**
 * Set an active effect on a player
 */
export function setActiveEffect(
  state: GameState, 
  playerId: string, 
  effect: keyof ActiveEffects, 
  value: boolean
): GameState {
  const updatedPlayers = state.players.map(player => {
    if (player.id === playerId) {
      return {
        ...player,
        activeEffects: {
          ...player.activeEffects,
          [effect]: value
        }
      };
    }
    return player;
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Clear all active effects for a player (called at end of round)
 */
export function clearActiveEffects(state: GameState, playerId: string): GameState {
  const updatedPlayers = state.players.map(player => {
    if (player.id === playerId) {
      return {
        ...player,
        activeEffects: createDefaultActiveEffects()
      };
    }
    return player;
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Clear all active effects for all players (called at end of round)
 */
export function clearAllActiveEffects(state: GameState): GameState {
  const updatedPlayers = state.players.map(player => ({
    ...player,
    activeEffects: createDefaultActiveEffects()
  }));

  return { ...state, players: updatedPlayers };
}

/**
 * Remove a card from player's hand
 */
export function removeCardFromHand(state: GameState, playerId: string, cardId: string): GameState {
  const updatedPlayers = state.players.map(player => {
    if (player.id === playerId) {
      return {
        ...player,
        cards: player.cards.filter(c => c.id !== cardId)
      };
    }
    return player;
  });

  return { ...state, players: updatedPlayers };
}

/**
 * Reset game to lobby state (for starting a new game)
 */
export function resetGame(state: GameState): GameState {
  // Reset all players to initial state
  const resetPlayers = state.players.map(player => ({
    ...player,
    dice: [],
    cards: [],
    isEliminated: false,
    activeEffects: createDefaultActiveEffects()
  }));

  return {
    ...state,
    phase: 'lobby',
    players: resetPlayers,
    currentTurnIndex: 0,
    currentBid: null,
    previousBids: [],
    roundNumber: 0,
    winnerId: null,
    lastDudoResult: null,
    pausedFromPhase: null
  };
}

/**
 * Pause the game
 */
export function pauseGame(state: GameState): GameState {
  // Can only pause during active game phases
  const pausablePhases: GamePhase[] = ['rolling', 'bidding', 'dudo_called', 'round_end'];
  
  if (!pausablePhases.includes(state.phase)) {
    throw new Error('Cannot pause game in current phase');
  }

  return {
    ...state,
    pausedFromPhase: state.phase,
    phase: 'paused'
  };
}

/**
 * Resume the game from paused state
 */
export function resumeGame(state: GameState): GameState {
  if (state.phase !== 'paused') {
    throw new Error('Game is not paused');
  }

  if (!state.pausedFromPhase) {
    throw new Error('No phase to resume to');
  }

  return {
    ...state,
    phase: state.pausedFromPhase,
    pausedFromPhase: null
  };
}
