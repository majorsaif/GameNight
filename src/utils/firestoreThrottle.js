const lastWriteTime = {};

/**
 * Throttles Firestore writes to prevent infinite loops from exhausting quota.
 * 
 * @param {string} key - Unique identifier for the throttle (e.g., phase name)
 * @param {Function} updateFn - The Firestore update function to execute
 * @param {number} minIntervalMs - Minimum time between writes in milliseconds (default: 2000)
 * @returns {Promise|undefined} Result of updateFn or undefined if throttled
 */
export function throttledUpdate(key, updateFn, minIntervalMs = 2000) {
  const now = Date.now();
  if (lastWriteTime[key] && now - lastWriteTime[key] < minIntervalMs) {
    console.warn('[Firestore Throttle] Write throttled for key:', key, `(${now - lastWriteTime[key]}ms since last write)`);
    return;
  }
  lastWriteTime[key] = now;
  console.log('[Firestore Throttle] Write allowed for key:', key);
  return updateFn();
}
