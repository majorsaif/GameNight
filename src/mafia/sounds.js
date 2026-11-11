// Mafia phase sound effects (originally from Mixkit - royalty free)
export const MAFIA_SOUNDS = {
  NIGHT_START: '/sounds/night-start.m4a',
  MAFIA_WAKE: '/sounds/mafia-wake.m4a',
  DOCTOR_WAKE: '/sounds/doctor-wake.m4a',
  DETECTIVE_WAKE: '/sounds/detective-wake.m4a',
  DAY_START: '/sounds/day-start.m4a'
};

const cache = new Map();

function getAudio(url) {
  if (!cache.has(url)) {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.volume = 0.5;
    cache.set(url, audio);
  }
  return cache.get(url);
}

/** Preload all sounds so they play instantly on slow connections. */
export function preloadMafiaSounds() {
  Object.values(MAFIA_SOUNDS).forEach((url) => getAudio(url));
}

export function playSound(url) {
  if (!url) return;
  try {
    const audio = getAudio(url);
    audio.currentTime = 0;
    const result = audio.play();
    if (result?.catch) {
      // Autoplay can be blocked until the player taps something - not an error
      result.catch(() => {});
    }
  } catch {
    // Audio not supported
  }
}
