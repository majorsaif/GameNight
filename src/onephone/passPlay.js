// Pass & Play keeps its player list on this device only (no Firebase at all).
const PLAYERS_KEY = 'gamenight_passplay_players';
export const PASS_PLAY_MAX_PLAYERS = 20;

export function loadPassPlayPlayers() {
  try {
    const raw = sessionStorage.getItem(PLAYERS_KEY) || localStorage.getItem(PLAYERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.id && p.displayName) : [];
  } catch {
    return [];
  }
}

export function savePassPlayPlayers(players) {
  try {
    const value = JSON.stringify(players || []);
    sessionStorage.setItem(PLAYERS_KEY, value);
    localStorage.setItem(PLAYERS_KEY, value);
  } catch {
    // storage unavailable - the list just won't survive a reload
  }
}

/** Shape used by the shared game logic modules. */
export function toGamePlayers(players) {
  return (players || []).map((p) => ({ uid: p.id, displayName: p.displayName, avatarColor: p.avatarColor }));
}
