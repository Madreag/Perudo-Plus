# Perudo+ Game Mechanics and Rules - Complete Documentation

---

## 1. GAME OVERVIEW

**Perudo+** is an enhanced version of the classic Perudo (Liar's Dice) game. It is a multiplayer bluffing game where players make bids about the total number of dice showing a particular face value across all players' hidden dice. The game supports **2-5 players** and features three distinct game modes with a card system for tactical depth.

---

## 2. GAME MODES

### 2.1 Classic Mode (`'classic'`)
- **Dice Setup**: All players start with **5 standard d6 dice**
- **Cards**: **No cards** are used in this mode
- **Behavior**: Pure traditional Perudo gameplay without any enhancements

### 2.2 Tactical Mode (`'tactical'`)
- **Dice Setup**: Players start with **3 × d6 dice + 2 random non-d6 dice** (d3, d4, d8, or d10)
- **Cards**: Standard card deck is used (28 cards total)
- **Card Draw**: Players draw a card when they lose a die (if hand is not full)
- **Max Hand Size**: 3 cards

### 2.3 Chaos Mode (`'chaos'`)
- **Dice Setup**: Same as Tactical (3 × d6 + 2 random)
- **Cards**: Enhanced card deck with **more dice manipulation cards**:
  - `reroll_one`: 4 copies (vs 2 in tactical)
  - `blind_swap`: 3 copies (vs 1 in tactical)
  - `polish`: 2 copies (vs 1 in tactical)
  - `crack`: 2 copies (vs 1 in tactical)

---

## 3. DICE SYSTEM

### 3.1 Dice Types (`DieType`)
The game supports **5 different polyhedral dice types**:

| Die Type | Faces Available | Face Distribution |
|----------|-----------------|-------------------|
| **d3** | 1, 2, 3 | Equal probability (1/3 each) |
| **d4** | 1, 2, 3, 4 | Equal probability (1/4 each) |
| **d6** | 1, 2, 3, 4, 5, 6 | Equal probability (1/6 each) |
| **d8** | 1, 2, 3, 4, 5, 6, 1, 2 | Extra 1s and 2s (weighted toward low values) |
| **d10** | 1, 2, 3, 4, 5, 6, 1, 2, 3, 4 | Extra 1-4 (heavily weighted toward low values) |

### 3.2 Dice Normalization
- **All dice produce face values between 1-6** after rolling
- Larger dice (d8, d10) have **biased distributions** favoring lower numbers
- This affects probability calculations for strategic play

### 3.3 Dice Upgrade/Downgrade Order
`d3 → d4 → d6 → d8 → d10`
- **Upgrade (Polish)**: Move one step right (d6 → d8)
- **Downgrade (Crack)**: Move one step left (d6 → d4)
- Cannot upgrade past d10 or downgrade below d3

### 3.4 Starting Dice Loadout
- **Classic Mode**: 5 × d6
- **Tactical/Chaos Mode**: 
  - 3 × d6 (guaranteed)
  - 2 × random (selected from d3, d4, d8, d10 - explicitly excluding d6)

---

## 4. GAME PHASES

The game progresses through the following phases (`GamePhase`):

### 4.1 `'lobby'`
- **Description**: Pre-game waiting room
- **Actions Available**: Join game, select slot, update settings (host only), start game (host only)
- **Transition**: Host clicks start → `'rolling'`

### 4.2 `'rolling'`
- **Description**: Dice are being rolled for all players
- **Automatic Behavior**: All player dice are re-rolled using `rollAllDice()`
- **Transition**: Automatic → `'bidding'`

### 4.3 `'bidding'`
- **Description**: Active gameplay phase where players take turns bidding or challenging
- **Actions Available**: `make_bid`, `call_dudo`, `call_jonti`, `play_card`
- **Turn Order**: Circular, based on `currentTurnIndex` among active players
- **Transition**: Dudo/Jonti called → `'dudo_called'`

### 4.4 `'dudo_called'`
- **Description**: A challenge has been made; all dice are revealed
- **Behavior**: All players' dice become visible to determine winner/loser
- **Transition**: After result applied → `'round_end'` or `'game_over'`

### 4.5 `'round_end'`
- **Description**: Round has concluded; waiting for next round
- **Actions Available**: `ready_for_round` (host only triggers new round)
- **Transition**: Host triggers → `'rolling'` (new round starts)

### 4.6 `'game_over'`
- **Description**: Game has ended; a winner has been determined
- **Winner Condition**: Only **one player remains with dice**
- **Actions Available**: `new_game` (host only - returns to lobby)

### 4.7 `'paused'`
- **Description**: Game is temporarily suspended
- **Automatic Trigger**: All players disconnect during active game
- **Manual Trigger**: Any player can pause (`pause_game` message)
- **Stores**: `pausedFromPhase` - the phase to resume to
- **Transition**: Resume → returns to `pausedFromPhase`

---

## 5. BIDDING MECHANICS

### 5.1 Bid Structure
A bid consists of:
```typescript
interface Bid {
  playerId: string;    // Who made the bid
  quantity: number;    // How many dice (minimum 1)
  faceValue: number;   // Which face value (1-6)
}
```

### 5.2 Valid Bid Rules

#### 5.2.1 First Bid of Round
- Any quantity ≥ 1 with any face value 1-6 is valid
- No restrictions on the opening bid

#### 5.2.2 Subsequent Bids (Standard Rules)
A new bid must be **higher** than the current bid. "Higher" means:

1. **Higher Quantity**: `newBid.quantity > currentBid.quantity` (any face value)
2. **Same Quantity, Higher Face**: `newBid.quantity === currentBid.quantity && newBid.faceValue > currentBid.faceValue`

#### 5.2.3 Special Rules for 1s (Aces/Wilds)
**Going TO 1s** (from non-1 to 1):
- Minimum quantity = `Math.ceil(currentBid.quantity / 2)`
- Example: Current bid is "6 × 4s" → Minimum bid on 1s is "3 × 1s"

**Going FROM 1s** (from 1 to non-1):
- Minimum quantity = `currentBid.quantity * 2 + 1`
- Example: Current bid is "3 × 1s" → Minimum bid on other values is "7 × Xs"

#### 5.2.4 Phantom Bid (Card Effect)
- When `activeEffects.phantomBid === true`, the player can make **any valid bid** (quantity ≥ 1, faceValue 1-6) **ignoring all increment rules**
- Effect is consumed after use (set to false)

### 5.3 Bid Validation Code Logic
```typescript
export function isValidBid(state: GameState, bid: Bid, isPhantomBid: boolean = false): boolean {
  if (bid.faceValue < 1 || bid.faceValue > 6) return false;
  if (bid.quantity < 1) return false;
  if (!state.currentBid) return true;  // First bid
  if (isPhantomBid) return true;       // Ignores rules
  
  const current = state.currentBid;
  if (bid.quantity > current.quantity) return true;
  if (bid.quantity === current.quantity && bid.faceValue > current.faceValue) return true;
  
  // 1s special rules
  if (bid.faceValue === 1 && current.faceValue !== 1) {
    return bid.quantity >= Math.ceil(current.quantity / 2);
  }
  if (current.faceValue === 1 && bid.faceValue !== 1) {
    return bid.quantity >= current.quantity * 2 + 1;
  }
  
  return false;
}
```

---

## 6. WILD 1s RULE

### 6.1 Core Mechanic
**1s (Aces) are WILD** - they count as **every other face value** when counting dice.

### 6.2 Counting Logic
```typescript
function countDiceFace(dice: Die[], faceValue: number, includeWilds: boolean = true): number {
  let count = 0;
  for (const die of dice) {
    if (die.faceValue === faceValue) {
      count++;
    } else if (includeWilds && faceValue !== 1 && die.faceValue === 1) {
      count++;  // 1s count as wilds for non-1 bids
    }
  }
  return count;
}
```

### 6.3 Wild Behavior Examples
- Counting 4s: Count all 4s **PLUS** all 1s
- Counting 1s: Count **ONLY** 1s (wilds don't apply to themselves)
- Total 3s on table with dice [1,3,5] and [3,1,2]: Count = 4 (two 3s + two 1s)

---

## 7. DUDO (CHALLENGE) MECHANICS

### 7.1 When Dudo Can Be Called
- Only the **current player** (whose turn it is) can call Dudo
- There must be a **current bid** to challenge
- Cannot be called on the first turn (no bid exists)

### 7.2 Dudo Resolution
```typescript
// Count all dice across all active players
const allDice = getActivePlayers(state).map(p => p.dice);
const actualCount = countTotalDiceFace(allDice, bid.faceValue, bid.faceValue !== 1);

// Dudo SUCCESS if actual count is LESS than bid quantity
const dudoSuccess = actualCount < bid.quantity;
const loserId = dudoSuccess ? bid.playerId : callerId;
```

### 7.3 Dudo Outcomes
| Scenario | Result | Who Loses Die |
|----------|--------|---------------|
| Actual count **<** bid quantity | Dudo **SUCCESS** | The **bidder** loses a die |
| Actual count **≥** bid quantity | Dudo **FAILS** | The **challenger** loses a die |

### 7.4 Active Effects on Dudo

#### Insurance Effect
- If `activeEffects.insurance === true` AND the challenger **loses** the Dudo:
  - The challenger loses **0 dice** instead of 1
- Effect is consumed after use

#### Double Dudo Effect
- If `activeEffects.doubleDudo === true`:
  - The loser loses **2 dice** instead of 1
- Effect is consumed after use

### 7.5 Card Draw on Die Loss
- In non-classic modes, when a player loses a die:
  - If their hand has fewer than 3 cards (`MAX_HAND_SIZE`), they draw 1 card
  - The card is drawn from a shuffled deck
  - Only the player who drew sees their card

---

## 8. JONTI (EXACT MATCH) MECHANICS

### 8.1 What is Jonti?
Jonti is a **high-risk, high-reward** call where the player claims the current bid is **exactly correct**.

### 8.2 When Jonti Can Be Called
- Only the **current player** can call Jonti
- There must be a **current bid** to call Jonti on
- Available as an alternative to making a bid or calling Dudo

### 8.3 Jonti Resolution
```typescript
const allDice = getActivePlayers(state).map(p => p.dice);
const actualCount = countTotalDiceFace(allDice, bid.faceValue, bid.faceValue !== 1);

// Jonti SUCCESS if actual count EXACTLY equals bid quantity
const jontiSuccess = actualCount === bid.quantity;
```

### 8.4 Jonti Outcomes
| Scenario | Result | Effect on Caller |
|----------|--------|------------------|
| Actual count **===** bid quantity | Jonti **SUCCESS** | Caller **gains 1 die** (a new d6) |
| Actual count **!==** bid quantity | Jonti **FAILS** | Caller **loses 1 die** |

### 8.5 Jonti Die Gain Mechanics
- On success, a **new d6** is added to the caller's dice array
- The new die starts with `faceValue: 1` but will be re-rolled at the start of the next round

---

## 9. ELIMINATION AND WIN CONDITIONS

### 9.1 Player Elimination
- A player is **eliminated** when they have **0 dice remaining**
- `player.isEliminated = true` when `player.dice.length === 0`
- Eliminated players remain in the game state but are excluded from:
  - Active player list
  - Turn order
  - Dice counting

### 9.2 Active Players Definition
```typescript
function getActivePlayers(state: GameState): Player[] {
  return state.players.filter(p => !p.isEliminated && p.dice.length > 0);
}
```

### 9.3 Win Condition
- The game ends when **only 1 active player remains**
- That player is declared the **winner** (`winnerId` is set)
- Game phase transitions to `'game_over'`

### 9.4 Win Check Logic
```typescript
const activePlayers = updatedPlayers.filter(p => !p.isEliminated);
const winnerId = activePlayers.length === 1 ? activePlayers[0].id : null;
const newPhase = winnerId ? 'game_over' : 'round_end';
```

---

## 10. TURN ORDER AND ROUND FLOW

### 10.1 Starting Player Selection
- **Game Start**: Random player is selected (`Math.floor(Math.random() * players.length)`)
- **New Round**: The **player who lost the previous round** starts (if still active)
  - If the loser was eliminated, the next active player starts

### 10.2 Turn Progression
```typescript
const activePlayers = getActivePlayers(state);
const nextTurnIndex = (state.currentTurnIndex + 1) % activePlayers.length;
```
- Turns cycle through active players in order
- Eliminated players are skipped automatically

### 10.3 Round Structure
1. **Rolling Phase**: All dice are re-rolled for all active players
2. **Bidding Phase**: Players take turns bidding until Dudo/Jonti is called
3. **Resolution Phase**: Challenge is resolved, dice revealed
4. **Round End**: Loser loses die(s), check for elimination/win
5. **Next Round**: If game continues, return to step 1

### 10.4 Round Reset (New Round)
```typescript
function startNewRound(state: GameState): GameState {
  const clearedState = clearAllActiveEffects(state);  // All effects reset
  return {
    ...clearedState,
    phase: 'rolling',
    roundNumber: state.roundNumber + 1,
    currentTurnIndex: startIndex,  // Loser starts
    currentBid: null,              // No current bid
    previousBids: [],              // Clear bid history
    lastDudoResult: null,
    pausedFromPhase: null
  };
}
```

---

## 11. CARD SYSTEM

### 11.1 Card Overview
Cards provide tactical advantages and can be played at specific timings. **Maximum hand size is 3 cards**.

### 11.2 Card Categories and Timings

#### Card Timing Types (`CardTiming`)
- `'on_turn'`: Can only be played during your turn
- `'reaction'`: Can be played in response to another action
- `'on_dudo'`: Can only be played when calling Dudo
- `'any'`: Can be played at any time

### 11.3 Complete Card List

#### INFORMATION CARDS (Common)

| Card | Type | Timing | Description | Copies (Tactical/Chaos) |
|------|------|--------|-------------|-------------------------|
| **Peek** | `peek` | `on_turn` | Privately view one die (type + face value) of another player | 4 / 4 |
| **Gauge** | `gauge` | `on_turn` | View the types (not faces) of 2 dice from any players | 3 / 3 |
| **False Tell** | `false_tell` | `any` | Announce you peeked at a die (bluff tool, no actual effect) | 2 / 2 |

#### BID MANIPULATION CARDS (Uncommon)

| Card | Type | Timing | Description | Copies (Tactical/Chaos) |
|------|------|--------|-------------|-------------------------|
| **Inflation** | `inflation` | `reaction` | Increase current bid by +1 quantity | 3 / 3 |
| **Wild Shift** | `wild_shift` | `reaction` | Change the face value of current bid (quantity unchanged) | 2 / 2 |
| **Phantom Bid** | `phantom_bid` | `on_turn` | Your next bid ignores normal increment rules | 2 / 2 |

#### DUDO INTERACTION CARDS (Uncommon)

| Card | Type | Timing | Description | Copies (Tactical/Chaos) |
|------|------|--------|-------------|-------------------------|
| **Insurance** | `insurance` | `on_dudo` | If your Dudo fails, you lose no dice this round | 3 / 3 |
| **Double Dudo** | `double_dudo` | `on_dudo` | If correct, opponent loses 2 dice; if wrong, you lose 2 | 2 / 2 |
| **Late Dudo** | `late_dudo` | `on_turn` | Call Dudo on a previous bid (not just current) | 2 / 2 |

#### DICE MANIPULATION CARDS (Rare)

| Card | Type | Timing | Description | Copies (Tactical/Chaos) |
|------|------|--------|-------------|-------------------------|
| **Re-roll One** | `reroll_one` | `on_turn` | Re-roll one of your own dice | 2 / 4 |
| **Blind Swap** | `blind_swap` | `on_turn` | Swap one of your dice with a random die from another player | 1 / 3 |
| **Polish** | `polish` | `on_turn` | Upgrade one of your dice (e.g., d4→d6, d6→d8) | 1 / 2 |
| **Crack** | `crack` | `on_turn` | Downgrade one of an opponent's dice | 1 / 2 |

### 11.4 Total Cards in Deck
- **Tactical Mode**: 28 cards total
- **Chaos Mode**: 34 cards total

### 11.5 Deck Shuffling
- Fisher-Yates shuffle algorithm is used
- Deck is created fresh for each game (not persistent across rounds)

---

## 12. ACTIVE EFFECTS SYSTEM

### 12.1 Active Effects Structure
```typescript
interface ActiveEffects {
  insurance: boolean;      // Next failed dudo doesn't cost a die
  doubleDudo: boolean;     // Next dudo has double stakes
  phantomBid: boolean;     // Next bid can ignore increment rules
  lateDudo: boolean;       // Can call dudo on previous bid (not fully implemented)
}
```

### 12.2 Effect Lifecycle
1. **Activation**: Card is played, effect is set to `true`
2. **Usage**: Effect is applied when the relevant action occurs
3. **Consumption**: Effect is set back to `false` after use
4. **Round Reset**: ALL active effects are cleared at the start of each new round

### 12.3 Effect Application Timing
- `insurance`: Checked and applied during `applyDudoResult()`
- `doubleDudo`: Checked and applied during `applyDudoResult()`
- `phantomBid`: Checked during `makeBid()` validation
- `lateDudo`: Flag is set but implementation is placeholder

---

## 13. CARD EFFECT IMPLEMENTATIONS

### 13.1 Re-roll One (`applyRerollOne`)
```typescript
function applyRerollOne(state: GameState, playerId: string, dieId: string): GameState {
  // Re-rolls the specified die belonging to the player
  // Uses the die's type to determine valid face values
}
```

### 13.2 Polish (`applyPolish`)
```typescript
function applyPolish(state: GameState, playerId: string, dieId: string): GameState {
  // Upgrades die: d3→d4→d6→d8→d10
  // Returns null if already at d10 (no change)
}
```

### 13.3 Crack (`applyCrack`)
```typescript
function applyCrack(state: GameState, targetPlayerId: string, dieId: string): GameState {
  // Downgrades opponent's die: d10→d8→d6→d4→d3
  // Returns null if already at d3 (no change)
}
```

### 13.4 Inflation (`applyInflation`)
```typescript
function applyInflation(state: GameState): GameState {
  // Adds +1 to current bid quantity
  // Requires a current bid to exist
}
```

### 13.5 Wild Shift (`applyWildShift`)
```typescript
function applyWildShift(state: GameState, newFaceValue: number): GameState {
  // Changes current bid's face value to newFaceValue
  // newFaceValue must be 1-6
  // Quantity remains unchanged
}
```

### 13.6 Blind Swap (`applyBlindSwap`)
```typescript
function applyBlindSwap(playerId: string, myDieId: string, targetPlayerId: string): GameState {
  // Selects random die from target player
  // Swaps die properties (type, faceValue) between player's chosen die and random target die
  // IDs remain the same (only content is swapped)
}
```

### 13.7 Peek
- Returns the full die information (`type` and `faceValue`) to the card player only
- Other players are notified a peek occurred but not what was seen

### 13.8 Gauge
- Returns die `type` only (not `faceValue`) for exactly 2 selected dice
- Target dice can be from different players

### 13.9 False Tell
- Broadcasts to all players that the card player "claims to have peeked"
- No actual game state change - purely a bluffing tool

---

## 14. PLAYER MANAGEMENT

### 14.1 Player Structure
```typescript
interface Player {
  id: string;               // Unique identifier (UUID)
  name: string;             // Display name
  ip: string;               // IP address for identification
  slot: number | null;      // Seat position (null = unassigned)
  dice: Die[];              // Current dice
  cards: Card[];            // Current hand
  isConnected: boolean;     // WebSocket connection status
  isHost: boolean;          // Is this the host player?
  isEliminated: boolean;    // Has this player lost all dice?
  activeEffects: ActiveEffects;  // Current active card effects
}
```

### 14.2 Host Privileges
The host (first player to join) has exclusive abilities:
- Start the game
- Reset/start new game
- Kick players
- Trigger new round (ready_for_round)

### 14.3 Slot System
- Players can select a slot (0 to maxPlayers-1) in the lobby
- Slots determine visual positioning
- `slot: null` means unassigned
- Slots are validated to prevent duplicates

### 14.4 Reconnection
- Players can reconnect by name matching
- Disconnected players (`isConnected: false`) can be re-joined
- On reconnect: player receives full game state and private info (dice/cards)

### 14.5 Kick Functionality
- Host only
- Cannot kick self
- Kicked player is removed from game state entirely
- Their WebSocket connection is closed

---

## 15. GAME SETTINGS

```typescript
interface GameSettings {
  mode: GameMode;           // 'classic' | 'tactical' | 'chaos'
  maxPlayers: number;       // Maximum players (2-5, default 5)
  enableCalza: boolean;     // Feature flag (not implemented)
  enableLastStand: boolean; // Feature flag (not implemented)
}
```

### 15.1 Settings Update (Lobby Only)
- Mode can be changed to classic/tactical/chaos
- maxPlayers can be adjusted (1-5)
- If maxPlayers decreases, players in now-invalid slots are unassigned

---

## 16. NETWORK PROTOCOL

### 16.1 Client Messages (Actions)
| Message Type | Description |
|--------------|-------------|
| `register` | Register with server |
| `list_sessions` | Get available game sessions |
| `create_session` | Create new game session |
| `join_session` | Join existing session |
| `leave_session` | Leave current session |
| `join_game` | Join the game (provide player name) |
| `start_game` | Start the game (host only) |
| `make_bid` | Make a bid (quantity + faceValue) |
| `call_dudo` | Challenge current bid |
| `call_jonti` | Call exact match |
| `play_card` | Play a card from hand |
| `ready_for_round` | Trigger new round (host only) |
| `new_game` | Reset to lobby (host only) |
| `pause_game` | Pause the game |
| `resume_game` | Resume from pause |
| `chat` | Send chat message |
| `kick_player` | Kick a player (host only) |
| `select_slot` | Select lobby slot |

### 16.2 Server Messages (Events)
| Message Type | Description |
|--------------|-------------|
| `connection_accepted` | Join confirmed with player ID |
| `game_started` | Game has started |
| `private_info` | Player's dice and cards (private) |
| `bid_made` | A bid was made |
| `dudo_called` | Someone called Dudo |
| `dudo_result` | Dudo resolution with revealed dice |
| `jonti_called` | Someone called Jonti |
| `jonti_result` | Jonti resolution |
| `round_started` | New round began |
| `game_over` | Game ended with winner |
| `card_played` | A card was played |
| `card_drawn` | Player drew a card (private) |
| `player_drew_card` | Notification that someone drew |
| `game_paused` / `game_resumed` | Pause state changes |
| `player_kicked` | Player was kicked |
| `error` | Error message with code |

---

## 17. PROBABILITY REFERENCE

### 17.1 Face Probability by Die Type
```typescript
function getFaceProbability(dieType: DieType, faceValue: number): number {
  const faces = DICE_FACES[dieType];
  const count = faces.filter(f => f === faceValue).length;
  return count / faces.length;
}
```

| Die | P(1) | P(2) | P(3) | P(4) | P(5) | P(6) |
|-----|------|------|------|------|------|------|
| d3 | 33.3% | 33.3% | 33.3% | 0% | 0% | 0% |
| d4 | 25% | 25% | 25% | 25% | 0% | 0% |
| d6 | 16.7% | 16.7% | 16.7% | 16.7% | 16.7% | 16.7% |
| d8 | 25% | 25% | 12.5% | 12.5% | 12.5% | 12.5% |
| d10 | 20% | 20% | 20% | 20% | 10% | 10% |

### 17.2 Effective Probability (Including Wilds)
For non-1 values, add P(1) to the face probability:
- d6 effective P(4): 16.7% + 16.7% = 33.3%
- d8 effective P(4): 12.5% + 25% = 37.5%

---

## 18. GAME STATE VISIBILITY

### 18.1 Public Information (Visible to All)
- Player names, IDs, connection status
- Number of dice each player has (`diceCount`)
- Number of cards each player has (`cardCount`)
- Current bid and bid history
- Current turn indicator
- Round number
- Active effects on each player
- Game phase

### 18.2 Private Information (Per Player)
- Own dice faces and types
- Own card details

### 18.3 Revealed Information (Temporary)
- All dice during `dudo_called` phase (DudoResult.revealedDice)

---

## 19. SESSION MANAGEMENT

### 19.1 Session Info
```typescript
interface SessionInfo {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
  mode: GameMode;
  createdAt: number;
}
```

### 19.2 Session Lifecycle
- Sessions are created with a name and settings
- First player becomes host
- Sessions can be browsed and joined by others
- Sessions auto-pause when all players disconnect
- Stale sessions (empty for >1 hour) can be cleaned up

---

## 20. EDGE CASES AND SPECIAL RULES

### 20.1 Die Loss Order
When a player loses dice, the **first die(s) in the array** are removed:
```typescript
const newDice = player.dice.slice(diceLost);  // Removes from start
```

### 20.2 Jonti Die Gain
New die is added to the **end** of the array:
```typescript
dice: [...player.dice, newDie]
```

### 20.3 Round Start Reset
At round start, the following are cleared/reset:
- All active effects → `false`
- Current bid → `null`
- Previous bids → `[]`
- Last dudo result → `null`
- Paused state → `null`

### 20.4 Game Reset (New Game)
Returns to lobby with:
- All players' dice cleared
- All players' cards cleared
- All elimination statuses reset
- Round number → 0
- All active effects cleared

---

*This documentation covers all game mechanics implemented in the Perudo+ codebase. The game extends traditional Perudo with dice variety, a card system, and multiple game modes for increased strategic depth.*
