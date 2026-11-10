import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { colorForUid } from '../utils/avatar';
import { generateRoomCode } from '../lib/random';
import { fetchProfilePhoto, getCachedPhoto, sanitizeName } from '../lib/profiles';

export const ROOMS_COLLECTION = 'rooms';
export const MAX_PLAYERS = 20;
export const ROOM_EXPIRY_MS = 12 * 60 * 60 * 1000;
const CLEANUP_KEY = 'gamenight_last_cleanup';
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function roomRef(roomId) {
  return doc(db, ROOMS_COLLECTION, roomId);
}

function toMillis(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function isRoomExpired(room) {
  const last = toMillis(room?.lastActivity) ?? toMillis(room?.createdAt);
  if (!last) return false;
  return Date.now() - last > ROOM_EXPIRY_MS;
}

function buildPlayer(user) {
  return {
    id: user.id,
    displayName: sanitizeName(user.displayName) || 'Player',
    displayNameForGame: null,
    avatarColor: colorForUid(user.id),
    photoVersion: user.photo && user.photoVersion ? user.photoVersion : null,
    joinedAt: new Date().toISOString()
  };
}

function joinedAtMs(player) {
  return toMillis(player?.joinedAt) ?? 0;
}

/** Players taking part in a lobby = everyone in the room except opted-out spectators. */
export function getLobbyParticipantIds(room) {
  const spectators = new Set(room?.activeActivity?.spectators || []);
  return (room?.playerIds || []).filter((id) => !spectators.has(id));
}

/**
 * Create a new room with a unique, easy-to-read code. One write.
 */
export async function createRoom(user) {
  if (!user?.id) throw new RoomError('auth', 'Still signing you in, try again in a second.');

  let code = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await getDocs(query(collection(db, ROOMS_COLLECTION), where('code', '==', code), limit(1)));
    if (existing.empty) break;
    code = generateRoomCode();
  }

  const host = buildPlayer(user);
  const docRef = await addDoc(collection(db, ROOMS_COLLECTION), {
    schemaVersion: 2,
    code,
    hostId: user.id,
    playerIds: [user.id],
    players: [host],
    activeActivity: null,
    createdAt: serverTimestamp(),
    lastActivity: serverTimestamp()
  });
  return { id: docRef.id, code };
}

export async function findRoomByCode(rawCode) {
  const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 6) return null;
  const snap = await getDocs(query(collection(db, ROOMS_COLLECTION), where('code', '==', code), limit(1)));
  if (snap.empty) return null;
  const room = { id: snap.docs[0].id, ...snap.docs[0].data() };
  if (isRoomExpired(room)) return null;
  return room;
}

/**
 * Join a room (idempotent). Runs in a transaction so simultaneous joins never
 * overwrite each other.
 */
export async function joinRoom(roomId, user) {
  if (!roomId) throw new RoomError('not-found', 'Room not found.');
  if (!user?.id) throw new RoomError('auth', 'Still signing you in, try again in a second.');

  const ref = roomRef(roomId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new RoomError('not-found', "This room doesn't exist or has ended.");
    const room = snap.data();
    if (!Array.isArray(room.playerIds)) {
      throw new RoomError('legacy', 'This room was created with an older version of the app. Please host a new room.');
    }
    if (isRoomExpired(room)) throw new RoomError('expired', 'This room has expired.');
    if (room.playerIds.includes(user.id)) return { id: roomId, ...room };
    if (room.playerIds.length >= MAX_PLAYERS) {
      throw new RoomError('full', `This room is full (${MAX_PLAYERS} players max).`);
    }

    const player = buildPlayer(user);
    tx.update(ref, {
      players: [...(room.players || []), player],
      playerIds: [...room.playerIds, user.id],
      lastActivity: serverTimestamp()
    });
    return { id: roomId, ...room };
  });
}

function removePlayerFromRoomData(room, targetId) {
  const players = (room.players || []).filter((p) => p.id !== targetId);
  const playerIds = (room.playerIds || []).filter((id) => id !== targetId);
  const updates = { players, playerIds, lastActivity: serverTimestamp() };

  if (room.hostId === targetId && players.length > 0) {
    const nextHost = [...players].sort((a, b) => joinedAtMs(a) - joinedAtMs(b))[0];
    updates.hostId = nextHost.id;
  }

  const activity = room.activeActivity;
  if (activity && Array.isArray(activity.spectators) && activity.spectators.includes(targetId)) {
    updates['activeActivity.spectators'] = activity.spectators.filter((id) => id !== targetId);
  }
  return updates;
}

/**
 * Leave a room. Deletes the room when the last player leaves and hands host to
 * the longest-standing player when the host leaves.
 */
export async function leaveRoom(roomId, userId) {
  if (!roomId || !userId) return;
  const ref = roomRef(roomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data();
    if (!Array.isArray(room.playerIds) || !room.playerIds.includes(userId)) return;
    if (room.playerIds.length <= 1) {
      tx.delete(ref);
      return;
    }
    tx.update(ref, removePlayerFromRoomData(room, userId));
  });
}

/** Host-only: remove someone (e.g. a player whose phone died). */
export async function removePlayer(roomId, hostId, targetId) {
  if (!roomId || !targetId || hostId === targetId) return;
  const ref = roomRef(roomId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const room = snap.data();
    if (room.hostId !== hostId || !room.playerIds?.includes(targetId)) return;
    tx.update(ref, removePlayerFromRoomData(room, targetId));
  });
}

/** Host-only: pass hosting to another player. */
export async function transferHost(roomId, newHostId) {
  await updateDoc(roomRef(roomId), { hostId: newHostId, lastActivity: serverTimestamp() });
}

export async function endActivity(roomId) {
  await updateDoc(roomRef(roomId), { activeActivity: null, lastActivity: serverTimestamp() });
}

export async function startWheel(roomId, wheelData) {
  const options = (Array.isArray(wheelData?.options) ? wheelData.options : [])
    .slice(0, 30)
    .map((option) => ({
      id: String(option.id),
      label: String(option.label || '').slice(0, 40),
      color: option.color || '#8b5cf6',
      playerId: option.playerId ?? null
    }));
  await updateDoc(roomRef(roomId), {
    activeActivity: {
      type: wheelData?.type === 'playerWheel' ? 'playerWheel' : 'customWheel',
      options,
      state: 'idle',
      resultId: null,
      spinStartTime: null,
      spinDuration: null,
      spinCount: 0
    },
    lastActivity: serverTimestamp()
  });
}

/**
 * Host spins the wheel. The result is chosen up front and every client animates
 * to it; clients work out "finished" from spinStartTime + spinDuration, so no
 * second write is needed.
 */
export async function spinWheel(roomId, activity) {
  const options = activity?.options || [];
  if (options.length < 2) return;
  const values = new Uint32Array(2);
  crypto.getRandomValues(values);
  const result = options[values[0] % options.length];
  const duration = 4000 + (values[1] % 3000);
  await updateDoc(roomRef(roomId), {
    'activeActivity.state': 'spinning',
    'activeActivity.resultId': result.id,
    'activeActivity.spinStartTime': Date.now(),
    'activeActivity.spinDuration': duration,
    'activeActivity.spinCount': (activity.spinCount || 0) + 1,
    lastActivity: serverTimestamp()
  });
}

/**
 * Deletes a handful of rooms that have been idle for 12h+. Runs at most every
 * 6h per device; security rules only allow deleting rooms that really expired.
 */
export async function cleanupExpiredRooms() {
  try {
    const last = Number(localStorage.getItem(CLEANUP_KEY) || 0);
    if (Date.now() - last < CLEANUP_INTERVAL_MS) return;
    localStorage.setItem(CLEANUP_KEY, String(Date.now()));
  } catch {
    return;
  }

  try {
    const cutoff = Timestamp.fromMillis(Date.now() - ROOM_EXPIRY_MS - 5 * 60 * 1000);
    const snap = await getDocs(query(
      collection(db, ROOMS_COLLECTION),
      where('lastActivity', '<', cutoff),
      limit(20)
    ));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
  } catch (error) {
    console.warn('Room cleanup skipped:', error?.code || error);
  }
}

/**
 * Resolves profile photos for a list of players (room players or game players).
 */
export function usePlayerPhotos(players) {
  const [photos, setPhotos] = useState({});
  const wanted = useMemo(() => {
    return (players || [])
      .map((p) => ({ uid: p?.id || p?.uid, version: p?.photoVersion, legacy: typeof p?.photo === 'string' ? p.photo : null }))
      .filter((p) => p.uid && (p.version || p.legacy));
  }, [players]);

  const wantedKey = wanted.map((p) => `${p.uid}:${p.version || 'legacy'}`).join('|');

  useEffect(() => {
    let cancelled = false;
    const initial = {};
    const missing = [];
    wanted.forEach(({ uid, version, legacy }) => {
      if (legacy) {
        initial[uid] = legacy;
        return;
      }
      const cached = getCachedPhoto(uid, version);
      if (cached) initial[uid] = cached;
      else missing.push({ uid, version });
    });
    setPhotos(initial);

    const load = (list, retriesLeft) => {
      list.forEach(({ uid, version }) => {
        fetchProfilePhoto(uid, version).then((photo) => {
          if (cancelled) return;
          if (!photo) {
            // The player may still be uploading their photo - try once more shortly
            if (retriesLeft > 0) retryTimer = setTimeout(() => load([{ uid, version }], retriesLeft - 1), 8000);
            return;
          }
          setPhotos((prev) => (prev[uid] === photo ? prev : { ...prev, [uid]: photo }));
        });
      });
    };
    let retryTimer = null;
    load(missing, 1);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
    // wantedKey captures the relevant content of `wanted`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  return photos;
}

function withPhotos(list, photos, idKey) {
  if (!Array.isArray(list)) return list;
  return list.map((p) => {
    if (!p || typeof p !== 'object') return p;
    const photo = photos[p[idKey]] || null;
    return photo === (p.photo ?? null) ? p : { ...p, photo };
  });
}

/**
 * Live room subscription. Joins the room automatically (invite links land here)
 * and decorates players with their profile photos.
 */
export function useRoom(roomId, user = null) {
  const [rawRoom, setRawRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const joinStateRef = useRef({ roomId: null, attempted: false, wasMember: false });
  const userId = user?.id || null;

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      setError('Room not found');
      return undefined;
    }
    setLoading(true);
    setError(null);
    setRawRoom(null);
    joinStateRef.current = { roomId, attempted: false, wasMember: false };

    const unsubscribe = onSnapshot(roomRef(roomId), (snap) => {
      if (!snap.exists()) {
        setRawRoom(null);
        setError("This room doesn't exist or has ended.");
        setLoading(false);
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      if (!Array.isArray(data.playerIds)) {
        setRawRoom(null);
        setError('This room was created with an older version of the app. Please host a new room.');
        setLoading(false);
        return;
      }
      if (isRoomExpired(data)) {
        setRawRoom(null);
        setError('This room has expired.');
        setLoading(false);
        return;
      }
      setRawRoom(data);
      setError(null);
      setLoading(false);
    }, (err) => {
      console.error('Room listener error:', err);
      setError(err?.code === 'permission-denied' ? "You don't have access to this room." : 'Could not load the room. Check your connection.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [roomId]);

  // Auto-join when opening a room link
  useEffect(() => {
    if (!rawRoom || !user?.id) return;
    const state = joinStateRef.current;
    const isMember = rawRoom.playerIds.includes(user.id);
    if (isMember) {
      state.wasMember = true;
      return;
    }
    if (state.wasMember) {
      setError('You were removed from this room.');
      return;
    }
    if (state.attempted) return;
    state.attempted = true;
    joinRoom(rawRoom.id, user).catch((err) => {
      console.error('Join failed:', err);
      setError(err?.message || 'Could not join this room.');
    });
  }, [rawRoom, user]);

  // Photos are keyed by uid, so the same map decorates game players too
  const photos = usePlayerPhotos(rawRoom?.players);

  const room = useMemo(() => {
    if (!rawRoom) return null;
    const next = { ...rawRoom, players: withPhotos(rawRoom.players, photos, 'id') };
    if (rawRoom.activeActivity && Array.isArray(rawRoom.activeActivity.players)) {
      next.activeActivity = {
        ...rawRoom.activeActivity,
        players: withPhotos(rawRoom.activeActivity.players, photos, 'uid')
      };
    }
    return next;
  }, [rawRoom, photos]);

  const isHost = Boolean(room && userId && room.hostId === userId);
  const isMember = Boolean(room && userId && room.playerIds.includes(userId));

  return { room, loading, error, isHost, isMember };
}
