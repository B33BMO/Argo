// Sound notification utilities
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

export type SoundEvent =
  | 'message'      // New message received
  | 'complete'     // Task/response complete
  | 'error'        // Error occurred
  | 'warning'      // Warning
  | 'tool_start'   // Tool execution started
  | 'tool_end';    // Tool execution finished

// Platform-specific sound commands
interface SoundConfig {
  enabled: boolean;
  volume: number; // 0-100
}

let config: SoundConfig = {
  enabled: true,
  volume: 50,
};

export function setSoundConfig(newConfig: Partial<SoundConfig>): void {
  config = { ...config, ...newConfig };
}

export function getSoundConfig(): SoundConfig {
  return { ...config };
}

// Play system beep/bell
async function playSystemBeep(): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS - use afplay with system sounds
      const soundPath = '/System/Library/Sounds/Ping.aiff';
      spawn('afplay', ['-v', String(config.volume / 100), soundPath]);
    } else if (platform === 'win32') {
      // Windows - use PowerShell to play a beep
      spawn('powershell', ['-c', '[console]::beep(800,200)']);
    } else {
      // Linux - try paplay or aplay
      try {
        // Try PulseAudio
        spawn('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga']);
      } catch {
        // Fallback to terminal bell
        process.stdout.write('\x07');
      }
    }
  } catch {
    // Fallback: terminal bell
    process.stdout.write('\x07');
  }
}

// Play different sounds for different events
async function playSoundForEvent(event: SoundEvent): Promise<void> {
  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS has nice system sounds
    const sounds: Record<SoundEvent, string> = {
      message: '/System/Library/Sounds/Blow.aiff',
      complete: '/System/Library/Sounds/Glass.aiff',
      error: '/System/Library/Sounds/Basso.aiff',
      warning: '/System/Library/Sounds/Sosumi.aiff',
      tool_start: '/System/Library/Sounds/Pop.aiff',
      tool_end: '/System/Library/Sounds/Tink.aiff',
    };

    const soundPath = sounds[event];
    if (soundPath) {
      try {
        spawn('afplay', ['-v', String(config.volume / 100), soundPath]);
      } catch {
        // Fallback to beep
        await playSystemBeep();
      }
    }
  } else if (platform === 'win32') {
    // Windows - different beep frequencies
    const frequencies: Record<SoundEvent, [number, number]> = {
      message: [600, 150],
      complete: [800, 200],
      error: [300, 300],
      warning: [500, 200],
      tool_start: [700, 100],
      tool_end: [900, 100],
    };

    const [freq, duration] = frequencies[event];
    spawn('powershell', ['-c', `[console]::beep(${freq},${duration})`]);
  } else {
    // Linux - try freedesktop sounds
    const sounds: Record<SoundEvent, string> = {
      message: '/usr/share/sounds/freedesktop/stereo/message.oga',
      complete: '/usr/share/sounds/freedesktop/stereo/complete.oga',
      error: '/usr/share/sounds/freedesktop/stereo/dialog-error.oga',
      warning: '/usr/share/sounds/freedesktop/stereo/dialog-warning.oga',
      tool_start: '/usr/share/sounds/freedesktop/stereo/button-pressed.oga',
      tool_end: '/usr/share/sounds/freedesktop/stereo/button-released.oga',
    };

    const soundPath = sounds[event];
    try {
      spawn('paplay', [soundPath]);
    } catch {
      // Try aplay
      try {
        spawn('aplay', ['-q', soundPath]);
      } catch {
        // Terminal bell
        process.stdout.write('\x07');
      }
    }
  }
}

// Public API
export async function playSound(event: SoundEvent): Promise<void> {
  if (!config.enabled) return;

  try {
    await playSoundForEvent(event);
  } catch {
    // Silently fail - sounds are not critical
  }
}

// Convenience functions
export async function notifyComplete(): Promise<void> {
  await playSound('complete');
}

export async function notifyError(): Promise<void> {
  await playSound('error');
}

export async function notifyMessage(): Promise<void> {
  await playSound('message');
}

// Bell character (works in most terminals)
export function bell(): void {
  if (config.enabled) {
    process.stdout.write('\x07');
  }
}

// Check if sound is available
export async function isSoundAvailable(): Promise<boolean> {
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      await execAsync('which afplay');
      return true;
    } else if (platform === 'win32') {
      return true; // PowerShell is always available
    } else {
      // Check for paplay or aplay
      try {
        await execAsync('which paplay');
        return true;
      } catch {
        try {
          await execAsync('which aplay');
          return true;
        } catch {
          return false;
        }
      }
    }
  } catch {
    return false;
  }
}

// Mute/unmute
export function mute(): void {
  config.enabled = false;
}

export function unmute(): void {
  config.enabled = true;
}

export function toggleMute(): boolean {
  config.enabled = !config.enabled;
  return config.enabled;
}
