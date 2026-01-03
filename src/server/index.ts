// ============================================
// Perudo+ Server Entry Point
// ============================================

import { GameServer } from './GameServer';
import { GameSettings, GameMode } from '../shared/types';

// Parse command line arguments
const args = process.argv.slice(2);
let port = 3000;
let mode: GameMode = 'tactical';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    port = parseInt(args[i + 1], 10) || 3000;
    i++;
  } else if (args[i] === '--mode' || args[i] === '-m') {
    const modeArg = args[i + 1];
    if (modeArg === 'classic' || modeArg === 'tactical' || modeArg === 'chaos') {
      mode = modeArg;
    }
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Perudo+ Game Server

Usage: npm run start:server -- [options]

Options:
  -p, --port <number>   Port to listen on (default: 3000)
  -m, --mode <mode>     Game mode: classic, tactical, chaos (default: tactical)
  -h, --help            Show this help message

Examples:
  npm run start:server -- --port 8080
  npm run start:server -- --port 3000 --mode chaos
`);
    process.exit(0);
  }
}

// Create game settings
const settings: GameSettings = {
  mode,
  maxPlayers: 5,
  enableCalza: false,
  enableLastStand: false
};

// Create and start the server
const server = new GameServer(port, settings);

server.start().then(() => {
  console.log(`Game mode: ${mode}`);
  console.log('Waiting for players to connect...');
}).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  server.stop();
  process.exit(0);
});
