# Perudo+ 🎲

A networked multiplayer PC game inspired by Perudo/Dudo with cards and mixed dice.

## Features

- **2-5 Players**: Host-client architecture with WebSocket networking
- **Mixed Dice System**: d3, d4, d6, d8, d10 with normalized face values (1-6)
- **Card System**: Strategic single-use cards for information, bid manipulation, and more
- **3D Visualization**: Three.js powered game table with realistic dice rendering
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
4. Wait for other players to join
5. Click "Start Game" when ready

**For other players:**
1. Open your browser and navigate to http://<host-ip>:<port> (e.g., http://68.3.162.151:3000)
2. Enter your name and click "Connect"
3. Wait for the host to start the game

**Note:** Players connecting remotely do NOT need to install or run any code - they simply open the URL in their browser!

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

**Card Types:**
- **Information**: Peek, Gauge, False Tell
- **Bid Manipulation**: Inflation, Wild Shift, Phantom Bid
- **Dudo Interaction**: Insurance, Double Dudo, Late Dudo
- **Dice Manipulation**: Re-roll One, Blind Swap, Polish, Crack

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
