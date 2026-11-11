import { arrayRemove, arrayUnion, serverTimestamp, updateDoc } from 'firebase/firestore';
import { roomRef, getLobbyParticipantIds } from '../hooks/useRoom';
import { transitionActivity } from './activity';
import { colorForUid } from '../utils/avatar';

export const GAME_LIMITS = {
  mafia: { min: 4, label: 'Mafia' },
  wordImposter: { min: 3, label: 'Word Imposter' },
  spyfall: { min: 3, label: 'Spyfall' }
};

/** Opens a lobby for a game. Everyone in the room is in by default; people can opt out as spectators. */
export async function openLobby(roomId, type, rules, extra = {}) {
  await updateDoc(roomRef(roomId), {
    activeActivity: {
      type,
      phase: 'lobby',
      phaseId: 0,
      rules,
      spectators: [],
      ...extra
    },
    lastActivity: serverTimestamp()
  });
}

export async function setSpectating(roomId, userId, spectating) {
  await updateDoc(roomRef(roomId), {
    'activeActivity.spectators': spectating ? arrayUnion(userId) : arrayRemove(userId),
    lastActivity: serverTimestamp()
  });
}

export async function saveLobbyRules(roomId, type, rules) {
  return transitionActivity(roomId, { type, phase: 'lobby' }, () => ({ rules }));
}

export function participantsFromRoom(room) {
  const ids = getLobbyParticipantIds(room);
  const byId = new Map((room.players || []).map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((p) => ({
      uid: p.id,
      displayName: p.displayNameForGame || p.displayName || 'Player',
      avatarColor: p.avatarColor || colorForUid(p.id)
    }));
}

/**
 * Starts a game from its lobby inside a transaction, using the *latest* room
 * membership. `deal(players, rules)` returns the activity updates or throws an
 * Error with a user-facing message.
 */
export async function startFromLobby(roomId, type, deal) {
  let failure = null;
  const started = await transitionActivity(roomId, { type, phase: 'lobby' }, (activity, room) => {
    const players = participantsFromRoom(room);
    const min = GAME_LIMITS[type]?.min || 3;
    if (players.length < min) {
      failure = `Need at least ${min} players to start (${players.length} joined).`;
      return null;
    }
    try {
      const updates = deal(players, activity.rules || {}, activity);
      return {
        lobbyPlayers: players.map((p) => p.uid),
        ...updates
      };
    } catch (error) {
      failure = error.message;
      return null;
    }
  });
  if (failure) throw new Error(failure);
  return started;
}
