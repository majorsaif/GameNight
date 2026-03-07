// Free sound effects for Mafia game
// Local sound files (originally from Mixkit - royalty free)

export const MAFIA_SOUNDS = {
  // Shushing/night ambience - soft whoosh
  NIGHT_START: '/sounds/night-start.m4a',
  
  // Knife unsheathing - blade sound
  MAFIA_WAKE: '/sounds/mafia-wake.wav',
  
  // Heartbeat monitor - cardiac beep
  DOCTOR_WAKE: '/sounds/doctor-wake.m4a',
  
  // Detective/mystery - suspenseful tension sting
  DETECTIVE_WAKE: '/sounds/detective-wake.wav',
  
  // Rooster crow - morning wake up
  DAY_START: '/sounds/day-start.wav'
};

/**
 * Play a sound effect from a URL
 * @param {string} url - The URL of the sound to play
 */
export function playSound(url) {
  if (!url) return;
  
  console.log('[playSound] Attempting to play:', url);
  const audio = new Audio(url);
  audio.volume = 0.5; // Set to 50% volume to avoid being too loud
  audio.play()
    .then(() => console.log('[playSound] Successfully started playback'))
    .catch(e => console.warn('Sound playback failed:', e));
}
