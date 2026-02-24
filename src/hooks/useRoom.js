import { useState, useEffect } from 'react';

const ROOMS_KEY = 'gamenight_rooms';

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

/**
 * Helper to create a new room
 */
export function createRoom(hostId, hostDisplayName, roomName = 'Game Night') {
  const roomId = 'room-' + Math.random().toString(36).substring(2, 15);
  const code = roomId.substring(5, 11).toUpperCase();
  
  const room = {
    id: roomId,
    code: code,
    name: roomName,
    hostId: hostId,
    players: [
      { id: hostId, displayName: hostDisplayName, isHost: true }
    ],
    createdAt: new Date().toISOString(),
    isActive: true
  };

  const rooms = getRoomsFromStorage();
  rooms[roomId] = room;
  saveRoomsToStorage(rooms);

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
      isHost: false
    });
    rooms[roomId] = room;
    saveRoomsToStorage(rooms);
  }

  return room;
}

/**
 * Helper to find a room by code
 */
export function findRoomByCode(code) {
  const rooms = getRoomsFromStorage();
  return Object.values(rooms).find(room => room.code.toUpperCase() === code.toUpperCase());
}

/**
 * Helper to update room name
 */
export function updateRoomName(roomId, newName) {
  const rooms = getRoomsFromStorage();
  const room = rooms[roomId];
  
  if (room) {
    room.name = newName || 'Game Night';
    saveRoomsToStorage(rooms);
  }
  
  return room;
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
        // If we have user info and user is not in the room, add them
        if (userId && userDisplayName) {
          const existingPlayer = foundRoom.players.find(p => p.id === userId);
          if (!existingPlayer) {
            foundRoom.players.push({
              id: userId,
              displayName: userDisplayName,
              isHost: false
            });
            rooms[roomId] = foundRoom;
            saveRoomsToStorage(rooms);
          }
        }
        setRoom(foundRoom);
      } else {
        setError('Room not found');
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
