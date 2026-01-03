// ============================================
// Perudo+ Music Manager
// Uses Howler.js for audio management
// ============================================

import { Howl, Howler } from 'howler';

export type MusicState = 'lobby' | 'match' | 'paused';

export class MusicManager {
  private static instance: MusicManager | null = null;
  
  private lobbyMusic: Howl | null = null;
  private matchMusic: Howl | null = null;
  
  private currentState: MusicState = 'lobby';
  private isUnlocked: boolean = false;
  private volume: number = 0.5; // Default 50%
  private matchPausedPosition: number = 0;
  private isMutedState: boolean = false;
  private lobbyFadeTimeout: ReturnType<typeof setTimeout> | null = null;
  
  private constructor() {
    this.initializeSounds();
    this.setupUnlockListener();
  }
  
  /**
   * Get the singleton instance of MusicManager
   */
  public static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }
  
  /**
   * Initialize the Howl sound objects
   */
  private initializeSounds(): void {
    // Lobby/Menu music (007.webm)
    this.lobbyMusic = new Howl({
      src: ['/music/007.webm'],
      loop: true,
      volume: this.volume,
      preload: true,
      html5: true, // Use HTML5 Audio for better streaming of larger files
      onloaderror: (id, error) => {
        console.error('Failed to load lobby music:', error);
      },
      onplayerror: (id, error) => {
        console.error('Failed to play lobby music:', error);
        // Try to unlock and play again
        this.unlockAudio();
      }
    });
    
    // Match/Action music (match.webm)
    this.matchMusic = new Howl({
      src: ['/music/match.webm'],
      loop: true,
      volume: this.volume,
      preload: true,
      html5: true,
      onloaderror: (id, error) => {
        console.error('Failed to load match music:', error);
      },
      onplayerror: (id, error) => {
        console.error('Failed to play match music:', error);
        this.unlockAudio();
      }
    });
    
    console.log('MusicManager: Sounds initialized');
  }
  
  /**
   * Setup listeners to unlock audio on first user interaction
   */
  private setupUnlockListener(): void {
    const unlockHandler = () => {
      this.unlockAudio();
      // Remove listeners after first interaction
      document.removeEventListener('click', unlockHandler);
      document.removeEventListener('keydown', unlockHandler);
      document.removeEventListener('touchstart', unlockHandler);
    };
    
    document.addEventListener('click', unlockHandler);
    document.addEventListener('keydown', unlockHandler);
    document.addEventListener('touchstart', unlockHandler);
    
    console.log('MusicManager: Unlock listeners set up');
  }
  
  /**
   * Unlock audio context (required by browser autoplay policies)
   */
  private unlockAudio(): void {
    if (this.isUnlocked) return;
    
    // Unlock Howler's audio context
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume().then(() => {
        console.log('MusicManager: Audio context resumed');
      });
    }
    
    this.isUnlocked = true;
    console.log('MusicManager: Audio unlocked');
    
    // Start playing based on current state
    this.applyCurrentState();
  }
  
  /**
   * Apply the current music state
   */
  private applyCurrentState(): void {
    if (!this.isUnlocked) return;
    
    switch (this.currentState) {
      case 'lobby':
        this.playLobbyMusic();
        break;
      case 'match':
        this.playMatchMusic();
        break;
      case 'paused':
        // When paused, lobby music plays and match is paused
        this.pauseMatchAndPlayLobby();
        break;
    }
  }
  
  /**
   * Cancel any pending lobby fade timeout
   */
  private cancelLobbyFadeTimeout(): void {
    if (this.lobbyFadeTimeout) {
      clearTimeout(this.lobbyFadeTimeout);
      this.lobbyFadeTimeout = null;
    }
  }
  
  /**
   * Play lobby music and stop match music
   */
  private playLobbyMusic(): void {
    this.cancelLobbyFadeTimeout();
    
    if (this.matchMusic) {
      this.matchMusic.stop();
    }
    this.matchPausedPosition = 0;
    
    if (this.lobbyMusic && !this.lobbyMusic.playing()) {
      this.lobbyMusic.volume(this.volume);
      this.lobbyMusic.play();
      console.log('MusicManager: Playing lobby music');
    }
  }
  
  /**
   * Play match music with fade in, stop lobby music with fade out
   */
  private playMatchMusic(): void {
    this.cancelLobbyFadeTimeout();
    
    // Fade out and stop lobby music
    if (this.lobbyMusic) {
      if (this.lobbyMusic.playing()) {
        this.lobbyMusic.fade(this.volume, 0, 1000);
        this.lobbyFadeTimeout = setTimeout(() => {
          this.lobbyMusic?.stop();
          this.lobbyFadeTimeout = null;
        }, 1000);
      } else {
        this.lobbyMusic.stop();
      }
    }
    
    // Start match music with fade in
    if (this.matchMusic) {
      // Stop first to reset position, then play from beginning
      this.matchMusic.stop();
      this.matchMusic.volume(this.volume);
      this.matchMusic.play();
      console.log('MusicManager: Playing match music');
    }
  }
  
  /**
   * Pause match music and play lobby music (for game pause state)
   */
  private pauseMatchAndPlayLobby(): void {
    this.cancelLobbyFadeTimeout();
    
    // Pause match music and save position
    if (this.matchMusic) {
      // Get position before pausing (only if playing)
      if (this.matchMusic.playing()) {
        this.matchPausedPosition = this.matchMusic.seek() as number;
      }
      this.matchMusic.pause();
      console.log('MusicManager: Match music paused at', this.matchPausedPosition);
    }
    
    // Play lobby music
    if (this.lobbyMusic) {
      this.lobbyMusic.volume(this.volume);
      if (!this.lobbyMusic.playing()) {
        this.lobbyMusic.play();
      }
      console.log('MusicManager: Playing lobby music (paused state)');
    }
  }
  
  /**
   * Resume match music from paused position and stop lobby music
   */
  private resumeMatchMusic(): void {
    this.cancelLobbyFadeTimeout();
    
    // Stop lobby music
    if (this.lobbyMusic) {
      this.lobbyMusic.stop();
    }
    
    // Resume match music from saved position
    if (this.matchMusic) {
      this.matchMusic.seek(this.matchPausedPosition);
      this.matchMusic.volume(this.volume);
      this.matchMusic.play();
      console.log('MusicManager: Resumed match music from', this.matchPausedPosition);
    }
  }
  
  // ============================================
  // Public API - State Transitions
  // ============================================
  
  /**
   * Transition to lobby/waiting state
   * Loops 007.webm
   */
  public toLobby(): void {
    console.log('MusicManager: Transitioning to lobby state');
    this.currentState = 'lobby';
    if (this.isUnlocked) {
      this.playLobbyMusic();
    }
  }
  
  /**
   * Transition to match start state
   * Stops/fades out 007.webm and starts looping match.webm
   */
  public toMatchStart(): void {
    console.log('MusicManager: Transitioning to match state');
    this.currentState = 'match';
    this.matchPausedPosition = 0;
    if (this.isUnlocked) {
      this.playMatchMusic();
    }
  }
  
  /**
   * Transition to paused state
   * Pauses match.webm and plays 007.webm
   */
  public toPaused(): void {
    console.log('MusicManager: Transitioning to paused state');
    this.currentState = 'paused';
    if (this.isUnlocked) {
      this.pauseMatchAndPlayLobby();
    }
  }
  
  /**
   * Resume from paused state
   * Stops 007.webm and resumes match.webm from where it left off
   */
  public toResumed(): void {
    console.log('MusicManager: Transitioning to resumed state');
    this.currentState = 'match';
    if (this.isUnlocked) {
      this.resumeMatchMusic();
    }
  }
  
  /**
   * Transition to match end state
   * Stops match.webm and goes back to looping 007.webm
   */
  public toMatchEnd(): void {
    console.log('MusicManager: Transitioning to match end (lobby) state');
    this.currentState = 'lobby';
    if (this.isUnlocked) {
      this.playLobbyMusic();
    }
  }
  
  // ============================================
  // Public API - Volume Control
  // ============================================
  
  /**
   * Set the volume for all music (0.0 to 1.0)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    
    if (this.lobbyMusic && this.lobbyMusic.playing()) {
      this.lobbyMusic.volume(this.volume);
    }
    if (this.matchMusic && this.matchMusic.playing()) {
      this.matchMusic.volume(this.volume);
    }
    
    console.log('MusicManager: Volume set to', this.volume);
  }
  
  /**
   * Get the current volume
   */
  public getVolume(): number {
    return this.volume;
  }
  
  /**
   * Mute all music
   */
  public mute(): void {
    Howler.mute(true);
    this.isMutedState = true;
    console.log('MusicManager: Muted');
  }
  
  /**
   * Unmute all music
   */
  public unmute(): void {
    Howler.mute(false);
    this.isMutedState = false;
    console.log('MusicManager: Unmuted');
  }
  
  /**
   * Toggle mute state
   */
  public toggleMute(): boolean {
    if (this.isMutedState) {
      this.unmute();
    } else {
      this.mute();
    }
    return this.isMutedState;
  }
  
  /**
   * Check if audio is currently muted
   */
  public isMuted(): boolean {
    return this.isMutedState;
  }
  
  /**
   * Get the current music state
   */
  public getCurrentState(): MusicState {
    return this.currentState;
  }
  
  /**
   * Check if audio has been unlocked
   */
  public isAudioUnlocked(): boolean {
    return this.isUnlocked;
  }
  
  /**
   * Dispose of all resources
   */
  public dispose(): void {
    this.cancelLobbyFadeTimeout();
    if (this.lobbyMusic) {
      this.lobbyMusic.unload();
      this.lobbyMusic = null;
    }
    if (this.matchMusic) {
      this.matchMusic.unload();
      this.matchMusic = null;
    }
    MusicManager.instance = null;
    console.log('MusicManager: Disposed');
  }
}

// Export singleton getter for convenience
export const getMusicManager = (): MusicManager => MusicManager.getInstance();
