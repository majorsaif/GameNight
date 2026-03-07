// Free sound effects for Mafia game
// All sounds sourced from Mixkit (https://mixkit.co) - royalty free

export const MAFIA_SOUNDS = {
  // Shushing/night ambience - soft whoosh
  NIGHT_START: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
  
  // Knife unsheathing - blade sound
  MAFIA_WAKE: 'https://assets.mixkit.co/active_storage/sfx/2733/2733-preview.mp3',
  
  // Heartbeat monitor - cardiac beep
  DOCTOR_WAKE: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  
  // Detective/mystery - suspenseful tension sting
  DETECTIVE_WAKE: 'https://assets.mixkit.co/active_storage/sfx/2359/2359-preview.mp3',
  
  // Rooster crow - morning wake up
  DAY_START: 'https://assets.mixkit.co/active_storage/sfx/1671/1671-preview.mp3'
};

/**
 * Play a sound effect from a URL
 * @param {string} url - The URL of the sound to play
 */
export function playSound(url) {
  if (!url) return;
  
  const audio = new Audio(url);
  audio.volume = 0.5; // Set to 50% volume to avoid being too loud
  audio.play().catch(e => console.warn('Sound playback failed:', e));
}
