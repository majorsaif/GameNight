import { useState, useEffect } from 'react';

const ROOMS_KEY = 'gamenight_rooms';
const ACTIVE_ROOM_KEY = 'gamenight_active_room';
const ROOM_EXPIRY_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Helper to get all rooms from localStorage
 */
function getRoomsFromStorage() {
  try {
    const data = localStorage.getItem(ROOMS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('Error reading rooms from localStorage:', error);
    return {};
  }
}

/**
 * Helper to save rooms to localStorage
 */
function saveRoomsToStorage(rooms) {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  } catch (error) {
    console.error('Error saving rooms to localStorage:', error);
  }
}

function getActiveRoomId() {
  return sessionStorage.getItem(ACTIVE_ROOM_KEY);
}

function setActiveRoomId(roomId) {
  if (roomId) {
    sessionStorage.setItem(ACTIVE_ROOM_KEY, roomId);
  }
}

function clearActiveRoomId() {
  sessionStorage.removeItem(ACTIVE_ROOM_KEY);
}

function isRoomExpired(room) {
  if (!room?.createdAt) return false;
  const createdAt = new Date(room.createdAt).getTime();
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt > ROOM_EXPIRY_MS;
}

function getJoinedAtValue(player, fallback) {
  const joinedAt = new Date(player.joinedAt || fallback || Date.now()).getTime();
  return Number.isNaN(joinedAt) ? Date.now() : joinedAt;
}

function normalizeRoom(room) {
  if (!room) return { room, didChange: false };

  let didChange = false;
  const fallback = room.createdAt || new Date().toISOString();
  const normalizedPlayers = (room.players || []).map((player) => {
    if (!player.joinedAt) {
      didChange = true;
    }
    return {
      ...player,
      joinedAt: player.joinedAt || fallback,
    };
  });

  if (!room.players || room.players.length !== normalizedPlayers.length) {
    didChange = true;
  }

  let hostId = room.hostId;
  if (!hostId && normalizedPlayers.length > 0) {
    hostId = normalizedPlayers[0].id;
    didChange = true;
  }

  normalizedPlayers.forEach((player) => {
    const shouldBeHost = player.id === hostId;
    if (player.isHost !== shouldBeHost) {
      didChange = true;
    }
    player.isHost = shouldBeHost;
  });

  return { room: { ...room, hostId, players: normalizedPlayers }, didChange };
}

function findRoomByPlayerId(rooms, userId) {
  return Object.values(rooms).find((room) =>
    room.players?.some((player) => player.id === userId)
  );
}

/**
 * Helper to create a new room
 */
export function createRoom(hostId, hostDisplayName) {
  const roomId = 'room-' + Math.random().toString(36).substring(2, 15);
  const code = roomId.substring(5, 11).toUpperCase();
  const now = new Date().toISOString();
  
  const room = {
    id: roomId,
    code: code,
    hostId: hostId,
    players: [
      { id: hostId, displayName: hostDisplayName, isHost: true, joinedAt: now }
    ],
    createdAt: now
  };

  const rooms = getRoomsFromStorage();
  rooms[roomId] = room;
  saveRoomsToStorage(rooms);
  setActiveRoomId(roomId);

  return room;
}

/**
 * Helper to join a room
 */
export function joinRoom(roomId, userId, userDisplayName) {
  const rooms = getRoomsFromStorage();
  const room = rooms[roomId];

  if (!room) {
    return null;
  }

  // Check if user is already in the room
  const existingPlayer = room.players.find(p => p.id === userId);
  
  if (!existingPlayer) {
    // Add user to the room
    room.players.push({
      id: userId,
      displayName: userDisplayName,
      isHost: false,
      joinedAt: new Date().toISOString()
    });
    rooms[roomId] = room;
    saveRoomsToStorage(rooms);
  }

  setActiveRoomId(roomId);

  return room;
}

/**
 * Helper to find a room by code
 */
export function findRoomByCode(code) {
  const rooms = getRoomsFromStorage();
  const room = Object.values(rooms).find(room => room.code.toUpperCase() === code.toUpperCase());

  if (room && isRoomExpired(room)) {
    delete rooms[room.id];
    saveRoomsToStorage(rooms);
    return null;
  }

  if (!room) return null;

  const normalized = normalizeRoom(room);
  if (normalized.didChange) {
    rooms[room.id] = normalized.room;
    saveRoomsToStorage(rooms);
  }
  return normalized.room;
}

/**
 * Helper to update player's display name for just this game night
 */
export function updatePlayerNameForGame(roomId, userId, gameDisplayName) {
  const rooms = getRoomsFromStorage();
  const room = rooms[roomId];
  
  if (room) {
    const player = room.players.find(p => p.id === userId);
    if (player) {
      player.displayNameForGame = gameDisplayName;
      saveRoomsToStorage(rooms);
    }
  }
  
  return room;
}

export function leaveRoom(roomId, userId) {
  const rooms = getRoomsFromStorage();
  let room = rooms[roomId];

  if (!room) {
    clearActiveRoomId();
    return null;
  }

  const normalized = normalizeRoom(room);
  room = normalized.room;
  const wasHost = room.hostId === userId;
  const remainingPlayers = room.players.filter((player) => player.id !== userId);

  if (remainingPlayers.length === 0) {
    delete rooms[roomId];
    saveRoomsToStorage(rooms);
    clearActiveRoomId();
    return null;
  }

  if (wasHost) {
    const nextHost = [...remainingPlayers].sort(
      (a, b) => getJoinedAtValue(a, room.createdAt) - getJoinedAtValue(b, room.createdAt)
    )[0];
    room.hostId = nextHost.id;
  }

  room.players = remainingPlayers.map((player) => ({
    ...player,
    isHost: player.id === room.hostId,
  }));
  rooms[roomId] = room;
  saveRoomsToStorage(rooms);
  clearActiveRoomId();
  return room;
}

export function useActiveRoom(userId) {
  const [activeRoom, setActiveRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expiredMessage, setExpiredMessage] = useState('');

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const loadActiveRoom = () => {
      const rooms = getRoomsFromStorage();
      let room = null;
      let expired = false;
      const activeRoomId = getActiveRoomId();

      if (activeRoomId && rooms[activeRoomId]) {
        room = rooms[activeRoomId];
        const isMember = room.players?.some((player) => player.id === userId);
        if (!isMember) {
          room = null;
        }
      }

      if (!room) {
        room = findRoomByPlayerId(rooms, userId);
      }

      if (room) {
        if (isRoomExpired(room)) {
          delete rooms[room.id];
          saveRoomsToStorage(rooms);
          clearActiveRoomId();
          expired = true;
          room = null;
        } else {
          const normalized = normalizeRoom(room);
          room = normalized.room;
          if (normalized.didChange) {
            rooms[room.id] = room;
            saveRoomsToStorage(rooms);
          }
          setActiveRoomId(room.id);
        }
      } else {
        clearActiveRoomId();
      }

      setActiveRoom(room || null);
      setExpiredMessage(expired ? 'This room has expired.' : '');
      setLoading(false);
    };

    loadActiveRoom();

    const handleStorageChange = (event) => {
      if (event.key === ROOMS_KEY) {
        loadActiveRoom();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(loadActiveRoom, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [userId]);

  return { activeRoom, loading, expiredMessage };
}

/**
 * Mock room data hook with localStorage sync across tabs
 * Will be replaced with Firestore listener later
 */
export function useRoom(roomId, userId = null, userDisplayName = null) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomId) {
      setLoading(false);
      return;
    }

    // Load room from localStorage
    const loadRoom = () => {
      const rooms = getRoomsFromStorage();
      const foundRoom = rooms[roomId];

      if (foundRoom) {
        if (isRoomExpired(foundRoom)) {
          delete rooms[roomId];
          saveRoomsToStorage(rooms);
          clearActiveRoomId();
          setRoom(null);
          setError('This room has expired');
          setLoading(false);
          return;
        }

        const normalized = normalizeRoom(foundRoom);
        const activeRoom = normalized.room;

        // If we have user info and user is not in the room, add them
        if (userId && userDisplayName) {
          const existingPlayer = activeRoom.players.find(p => p.id === userId);
          if (!existingPlayer) {
            activeRoom.players.push({
              id: userId,
              displayName: userDisplayName,
              isHost: false,
              joinedAt: new Date().toISOString()
            });
            rooms[roomId] = activeRoom;
            saveRoomsToStorage(rooms);
          } else if (!existingPlayer.joinedAt) {
            existingPlayer.joinedAt = new Date().toISOString();
            rooms[roomId] = activeRoom;
            saveRoomsToStorage(rooms);
          } else if (normalized.didChange) {
            rooms[roomId] = activeRoom;
            saveRoomsToStorage(rooms);
          }
        } else if (normalized.didChange) {
          rooms[roomId] = activeRoom;
          saveRoomsToStorage(rooms);
        }
        setActiveRoomId(roomId);
        setRoom(activeRoom);
        setError(null);
      } else {
        setError('Room not found');
        setRoom(null);
      }
      setLoading(false);
    };

    // Initial load
    loadRoom();

    // Listen for storage changes from other tabs
    const handleStorageChange = (e) => {
      if (e.key === ROOMS_KEY) {
        loadRoom();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // Also poll for changes (since storage event doesn't fire in the same tab)
    const interval = setInterval(loadRoom, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [roomId, userId, userDisplayName]);

  // Helper to check if current user is host
  const isHost = room && userId && room.hostId === userId;

  return { room, loading, error, isHost };
}
