// ============================================
// Perudo+ Server Entry Point
// ============================================

import { SessionManager } from './SessionManager';

// Parse command line arguments
const args = process.argv.slice(2);
let port = 3000;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' || args[i] === '-p') {
    port = parseInt(args[i + 1], 10) || 3000;
    i++;
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log(`
Perudo+ Session Server

Usage: npm run start:server -- [options]

Options:
  -p, --port <number>   Port to listen on (default: 3000)
  -h, --help            Show this help message

Examples:
  npm run start:server -- --port 8080
  npm run start:server -- --port 3000
`);
    process.exit(0);
  }
}

// Create and start the session manager
const server = new SessionManager(port);

server.start().then(() => {
  console.log('Players can now browse and create game sessions.');
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
