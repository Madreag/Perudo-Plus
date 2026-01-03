// ============================================
// Perudo+ Client Entry Point
// ============================================

import { GameClient } from './GameClient';

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('game-container');
  if (!container) {
    console.error('Game container not found');
    return;
  }

  // Create game client
  const client = new GameClient(container);

  // Handle page unload
  window.addEventListener('beforeunload', () => {
    client.dispose();
  });

  console.log('Perudo+ Client initialized');
});
