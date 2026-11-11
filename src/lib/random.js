// Small helpers for fair randomness. Uses crypto when available so role/word
// assignment isn't biased (Array.sort(() => Math.random() - 0.5) is not a fair shuffle).

export function randomInt(maxExclusive) {
  if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0;
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (cryptoObj?.getRandomValues) {
    // Rejection sampling to avoid modulo bias
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const buf = new Uint32Array(1);
    do {
      cryptoObj.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[randomInt(list.length)];
}

export function shuffle(list) {
  const copy = Array.isArray(list) ? [...list] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Unambiguous characters only (no 0/O, 1/I/L) so codes are easy to read aloud.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export function generateRoomCode() {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Counts votes ({ voterUid: targetUid }) and returns the leaders.
 * Only voters/targets in `allowedUids` (if given) are counted.
 */
export function tallyVotes(votes, allowedUids = null) {
  const allowed = Array.isArray(allowedUids) ? new Set(allowedUids) : null;
  const counts = {};
  Object.entries(votes || {}).forEach(([voter, target]) => {
    if (!target) return;
    if (allowed && (!allowed.has(voter) || !allowed.has(target))) return;
    counts[target] = (counts[target] || 0) + 1;
  });
  let max = 0;
  let leaders = [];
  Object.entries(counts).forEach(([uid, count]) => {
    if (count > max) {
      max = count;
      leaders = [uid];
    } else if (count === max) {
      leaders.push(uid);
    }
  });
  return { counts, max, leaders };
}
