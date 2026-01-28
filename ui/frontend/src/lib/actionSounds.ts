/**
 * Action sounds module for UI feedback
 * Plays sounds for recording start/stop and other actions
 */

type ActionSoundType = 'start' | 'complete' | 'error';

interface ActionSoundConfig {
  start?: boolean;
  complete?: boolean;
}

let soundConfig: ActionSoundConfig = {
  start: true,
  complete: true,
};

// Pre-create audio context for better performance
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

/**
 * Play a simple beep sound
 */
function playBeep(frequency: number, duration: number, volume: number = 0.3): void {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Could not play sound:', e);
  }
}

/**
 * Play an action sound based on the type
 */
export function playActionSound(type: ActionSoundType): void {
  // Check if sound is enabled for this type
  if (type === 'start' && !soundConfig.start) return;
  if (type === 'complete' && !soundConfig.complete) return;
  
  switch (type) {
    case 'start':
      // Rising tone for start
      playBeep(440, 0.15, 0.2);
      setTimeout(() => playBeep(554, 0.15, 0.2), 100);
      break;
    case 'complete':
      // Descending tone for complete
      playBeep(554, 0.15, 0.2);
      setTimeout(() => playBeep(440, 0.2, 0.2), 100);
      break;
    case 'error':
      // Low tone for error
      playBeep(220, 0.3, 0.3);
      break;
  }
}

/**
 * Apply configuration for action sounds
 */
export function applyActionSoundConfig(config: ActionSoundConfig): void {
  soundConfig = { ...soundConfig, ...config };
}
