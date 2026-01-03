# Perudo+ 🎲

A networked multiplayer PC game inspired by Perudo/Dudo with cards and mixed dice.

## Features

- **2-6 Players**: Host-client architecture with WebSocket networking
- **Mixed Dice System**: d3, d4, d6, d8, d10 with normalized face values (1-6)
- **Card System**: Strategic single-use cards for information, bid manipulation, and more
- **3D Visualization**: Three.js powered game table with realistic dice rendering
- **WC3-Style Lobby**: Warcraft 3 inspired lobby with player slot selection
- **Lobby Chat**: Chat with other players before the game starts
- **Host Controls**: Kick players, manage slots, start game when ready
- **Player Reconnection**: Rejoin if disconnected during a game
- **Resizable UI**: Adjustable chat panel during gameplay
- **Three Game Modes**:
  - **Classic**: Traditional Perudo with all d6 dice
  - **Tactical**: Mixed dice + cards (default)
  - **Chaos**: Expanded card pool with more dice manipulation

## Installation

    npm install
    npm run build

## Running the Game

### Start the Server (Host)

    # Default port 3000, tactical mode
    npm run start

    # Custom port and mode
    npm run start -- --port 8080 --mode chaos

The server will display its public IP address for other players to connect.

### Connecting to the Game

**For the host:**
1. Start the server as shown above
2. Open your browser to http://localhost:3000
3. Enter your name and click "Connect"
4. Select a player slot in the lobby
5. Wait for other players to join and select their slots
6. Use the kick button to remove unwanted players if needed
7. Click "Start Game" when ready

**For other players:**
1. Open your browser and navigate to http://<host-ip>:<port> (e.g., http://68.3.162.151:3000)
2. Enter your name and click "Connect"
3. Select an available player slot in the lobby
4. Chat with other players while waiting
5. Wait for the host to start the game

**Note:** Players connecting remotely do NOT need to install or run any code - they simply open the URL in their browser!

### Lobby Features

- **Player Slots**: Up to 6 slots available - players must select a slot before the game starts
- **Unassigned Players**: New players appear in the unassigned list until they choose a slot
- **Lobby Chat**: Communicate with other players before the game begins
- **Host Controls**: The host (indicated by 👑) can kick players from the lobby
- **IP Display**: Player IP addresses are shown for identification

### Reconnection

If you get disconnected during a game:
1. Refresh the page or navigate back to the game URL
2. Enter the **same name** you used before
3. Click "Connect" to rejoin the game in progress
4. Your dice and cards will be restored

### Development Mode

    # Run server with hot reload (for development)
    npm run dev:server

    # Run client with Vite dev server (for development)
    npm run dev:client

    # Run both simultaneously
    npm run dev

## Game Rules

### Core Perudo Rules
- All players roll their dice secretly at the start of a round
- Players take turns making bids (quantity + face value 1-6)
- Each new bid must be higher than the previous
- **1s are wild** (count as any face except when bidding 1s)
- Call **Dudo** to challenge the previous bid
- Loser of the challenge loses one die
- Last player remaining wins

### Mixed Dice (Tactical/Chaos modes)
- Players start with 2x d6 + 1 random die (d3, d4, d8, or d10)
- All dice map to values 1-6
- Larger dice have more consistent low values
- Die sizes are hidden from opponents

### Card System
- Draw 1 card when you lose a die
- Maximum hand size: 3 cards
- Cards are single-use
- Card timing determines when they can be played

**Card Timings:**
- **On Turn**: Play during your turn before bidding
- **Reaction**: Play in response to another player's action
- **On Dudo**: Play when calling or being called with Dudo
- **Any**: Play at any time

#### Information Cards (Common)

| Card | Timing | Description |
|------|--------|-------------|
| **Peek** | On Turn | Privately view one die (size + face) of another player |
| **Gauge** | On Turn | View the sizes (not faces) of two dice from any players |
| **False Tell** | Any | Announce you peeked at a die (even if you didn't) - bluff tool |

#### Bid Manipulation Cards (Uncommon)

| Card | Timing | Description |
|------|--------|-------------|
| **Inflation** | Reaction | Increase the current bid by +1 quantity automatically |
| **Wild Shift** | Reaction | Change the face value of the current bid (quantity unchanged) |
| **Phantom Bid** | On Turn | Make a legal bid ignoring normal increment rules |

#### Dudo Interaction Cards (Uncommon)

| Card | Timing | Description |
|------|--------|-------------|
| **Insurance** | On Dudo | If your Dudo fails, you lose no dice this round |
| **Double Dudo** | On Dudo | If correct, opponent loses 2 dice; if wrong, you lose 2 |
| **Late Dudo** | On Turn | Call Dudo on a previous bid, not just the current one |

#### Dice Manipulation Cards (Rare)

| Card | Timing | Description |
|------|--------|-------------|
| **Re-roll One** | On Turn | Re-roll one of your own dice |
| **Blind Swap** | On Turn | Swap one of your hidden dice with a random die from another player |
| **Polish** | On Turn | Upgrade one of your dice (d4→d6, d6→d8, etc.) |
| **Crack** | On Turn | Downgrade one of an opponent's dice |

#### Card Deck Composition

**Tactical Mode:**
- Peek (4), Gauge (3), False Tell (2)
- Inflation (3), Wild Shift (2), Phantom Bid (2)
- Insurance (3), Double Dudo (2), Late Dudo (2)
- Re-roll One (2), Blind Swap (1), Polish (1), Crack (1)

**Chaos Mode:** Same as Tactical, but with more dice manipulation cards:
- Re-roll One (4), Blind Swap (3), Polish (2), Crack (2)

## Project Structure

    perudo-plus/
    ├── src/
    │   ├── server/
    │   │   ├── index.ts          # Server entry point
    │   │   └── GameServer.ts     # WebSocket server & game logic
    │   ├── client/
    │   │   ├── index.ts          # Client entry point
    │   │   ├── GameClient.ts     # Main client application
    │   │   ├── NetworkClient.ts  # WebSocket client
    │   │   ├── GameRenderer.ts   # Three.js 3D rendering
    │   │   └── UIManager.ts      # HTML UI overlay
    │   └── shared/
    │       ├── index.ts          # Shared exports
    │       ├── types.ts          # TypeScript interfaces
    │       ├── dice.ts           # Dice logic & mapping
    │       ├── cards.ts          # Card definitions & effects
    │       └── gameState.ts      # Game state management
    ├── public/
    │   └── index.html            # Client HTML (development)
    ├── dist/
    │   ├── client-bundle/        # Bundled client (production)
    │   └── server/               # Compiled server
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── README.md

## Development

    # Run both server and client in development mode
    npm run dev

    # Build for production
    npm run build

    # Start production server
    npm run start

## Technical Stack

- **Backend**: Node.js + TypeScript + Express + ws (WebSocket)
- **Frontend**: Three.js + TypeScript + Vite
- **Networking**: WebSocket with JSON messages
- **Architecture**: Host-Client (server is also a player)

## License

MIT
