import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { getAvatarColor } from '../utils/avatar';

const ROOMS_COLLECTION = 'rooms';
const ROOM_EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours
const ACTIVE_ROOM_KEY = 'gamesnight_active_room';
const MAX_ROOM_PHOTO_URL_LENGTH = 2048;
let inMemoryActiveRoomId = null;

function sanitize(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildSanitizedWritePayload(data = {}, fieldValueData = {}) {
  return {
    ...sanitize(data),
    ...fieldValueData
  };
}

function normalizePhotoForRoom(photo) {
  if (typeof photo !== 'string') return null;

  const trimmedPhoto = photo.trim();
  if (!trimmedPhoto) return null;

  // Base64 payloads can easily exceed Firestore document size limits when embedded in players[]
  if (trimmedPhoto.startsWith('data:')) return null;

  // Blob URLs are device-local and not useful to persist in shared room state
  if (trimmedPhoto.startsWith('blob:')) return null;

  // Guardrail for unexpectedly large URL-like payloads
  if (trimmedPhoto.length > MAX_ROOM_PHOTO_URL_LENGTH) return null;

  return trimmedPhoto;
}

function buildSerializablePlayer({
  id,
  displayName,
  photo = null,
  isHost = false,
  joinedAt,
  avatarColor = null,
  displayNameForGame
}) {
  return sanitize({
    id: id ?? null,
    displayName: displayName ?? null,
    photo: normalizePhotoForRoom(photo),
    isHost: Boolean(isHost),
    joinedAt: joinedAt ?? new Date().toISOString(),
    avatarColor: avatarColor ?? null,
    displayNameForGame: displayNameForGame ?? null
  });
}

function setActiveRoomId(roomId) {
  if (!roomId) return;

  inMemoryActiveRoomId = roomId;

  try {
    sessionStorage.setItem(ACTIVE_ROOM_KEY, roomId);
  } catch (error) {
    console.warn('Unable to persist active room in sessionStorage:', error);
  }
}

function getActiveRoomId() {
  try {
    return sessionStorage.getItem(ACTIVE_ROOM_KEY) || inMemoryActiveRoomId;
  } catch (error) {
    console.warn('Unable to read active room from sessionStorage:', error);
    return inMemoryActiveRoomId;
  }
}

function clearActiveRoomId() {
  inMemoryActiveRoomId = null;

  try {
    sessionStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch (error) {
    console.warn('Unable to clear active room from sessionStorage:', error);
  }
}

function isRoomExpired(room) {
  if (!room) return false;
  
  // Use lastActivity if it exists, otherwise fall back to createdAt
  const timestampToCheck = room.lastActivity || room.createdAt;
  
  if (!timestampToCheck) return false;
  
  const checkTime = timestampToCheck instanceof Timestamp 
    ? timestampToCheck.toMillis() 
    : new Date(timestampToCheck).getTime();
  
  if (Number.isNaN(checkTime)) return false;
  
  return Date.now() - checkTime > ROOM_EXPIRY_MS;
}

function getJoinedAtValue(player, fallback) {
  const joinedAt = player.joinedAt instanceof Timestamp 
    ? player.joinedAt.toMillis() 
    : new Date(player.joinedAt || fallback || Date.now()).getTime();
  return Number.isNaN(joinedAt) ? Date.now() : joinedAt;
}

/**
 * Helper to update lastActivity timestamp
 */
async function updateLastActivity(roomRef) {
  try {
    const payload = buildSanitizedWritePayload({}, {
      lastActivity: serverTimestamp()
    });
    console.error('[updateLastActivity] Firestore write payload:', payload);
    await updateDoc(roomRef, payload);
  } catch (error) {
    console.error('Error updating lastActivity:', error);
  }
}

/**
 * Create a new room in Firestore
 */
export async function createRoom(hostId, hostDisplayName, hostPhoto = null) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date().toISOString();
  
  const hostPlayer = buildSerializablePlayer({ 
    id: hostId, 
    displayName: hostDisplayName,
    photo: hostPhoto ?? null,
    isHost: true, 
    joinedAt: now,
    avatarColor: null
  });
  
  const roomData = sanitize({
    code: code ?? null,
    hostId: hostId ?? null,
    players: [hostPlayer],
    createdAt: null,
    lastActivity: null,
    activeActivity: null
  });

  const roomWritePayload = buildSanitizedWritePayload(roomData, {
    createdAt: serverTimestamp(),
    lastActivity: serverTimestamp()
  });
  
  try {
    console.log('[createRoom] hostPlayer payload:', hostPlayer);
    console.error('[createRoom] Firestore write payload (addDoc room):', roomWritePayload);
    const docRef = await addDoc(collection(db, ROOMS_COLLECTION), roomWritePayload);
    const createdRoomId = docRef.id;
    console.log('✅ Room created successfully:', { docId: createdRoomId, code: code });
    
    // Generate avatar color after room is created (we need the room ID)
    const updatedHostPlayer = buildSerializablePlayer({
      ...hostPlayer,
      avatarColor: getAvatarColor(hostPlayer, createdRoomId)
    });
    console.log('[createRoom] updatedHostPlayer payload:', updatedHostPlayer);
    const updateHostPayload = buildSanitizedWritePayload({
      players: [updatedHostPlayer]
    });
    console.error('[createRoom] Firestore write payload (update host player):', updateHostPayload);
    await updateDoc(docRef, updateHostPayload);
    
    setActiveRoomId(createdRoomId);
    
    const result = { id: createdRoomId, code, ...roomWritePayload };
    console.log('🌐 Room object for navigation:', result);
    return result;
  } catch (error) {
    console.error('❌ Error creating room:', error);
    throw error;
  }
}

/**
 * Find a room by code and return it
 */
export async function findRoomByCode(code) {
  try {
    if (!code) {
      console.error('❌ findRoomByCode: No code provided');
      return null;
    }
    
    console.log('🔍 findRoomByCode: Querying Firestore for code:', code.toUpperCase());
    const q = query(
      collection(db, ROOMS_COLLECTION),
      where('code', '==', code.toUpperCase())
    );
    
    console.log('⏳ findRoomByCode: Executing query...');
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.warn('❌ findRoomByCode: No room found with code:', code.toUpperCase());
      return null;
    }
    
    const roomDoc = querySnapshot.docs[0];
    const room = { id: roomDoc.id, ...roomDoc.data() };
    console.log('✅ findRoomByCode: Room found!', { roomId: room.id, code: room.code, playerCount: room.players?.length || 0 });
    
    // Check if room is expired
    if (isRoomExpired(room)) {
      console.log('⏰ findRoomByCode: Room is expired, deleting...');
      try {
        await deleteDoc(doc(db, ROOMS_COLLECTION, roomDoc.id));
        console.log('✅ findRoomByCode: Expired room deleted');
      } catch (error) {
        console.error('Error deleting expired room:', error);
      }
      return null;
    }
    
    return room;
  } catch (error) {
    console.error('❌ findRoomByCode: Query failed with error:', error.message, error);
    throw error;
  }
}

/**
 * Join a room
 */
export async function joinRoom(roomId, userId, userDisplayName, userPhoto = null) {
  try {
    if (!roomId) {
      console.error('❌ joinRoom: No roomId provided');
      throw new Error('Room ID is required to join');
    }
    if (!userId) {
      console.error('❌ joinRoom: No userId provided');
      throw new Error('User ID is required to join');
    }
    if (!userDisplayName) {
      console.error('❌ joinRoom: No userDisplayName provided');
      throw new Error('User display name is required to join');
    }
    
    console.log('📍 joinRoom: Attempting to join room:', { roomId, userId, userDisplayName });
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    console.log('🔍 joinRoom: Fetching room document...');
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) {
      console.error('❌ joinRoom: Room document does not exist:', roomId);
      throw new Error(`Room with ID ${roomId} does not exist`);
    }
    
    const room = { id: roomDoc.id, ...roomDoc.data() };
    console.log('✅ joinRoom: Room document found:', { roomId, playerCount: room.players?.length || 0 });

    const roomPlayers = Array.isArray(room.players) ? room.players : [];
    const hasLegacyPlayerPhotoPayload = roomPlayers.some((player) => {
      const originalPhoto = player?.photo ?? player?.photoURL ?? null;
      const normalizedPhoto = normalizePhotoForRoom(originalPhoto);
      return (originalPhoto ?? null) !== normalizedPhoto;
    });

    if (hasLegacyPlayerPhotoPayload) {
      const normalizedPlayers = roomPlayers.map((player) => buildSerializablePlayer({
        id: player?.id ?? null,
        displayName: player?.displayName ?? null,
        photo: player?.photo ?? player?.photoURL ?? null,
        isHost: player?.id === room.hostId,
        joinedAt: player?.joinedAt ?? new Date().toISOString(),
        avatarColor: player?.avatarColor ?? null,
        displayNameForGame: player?.displayNameForGame ?? null
      }));

      const normalizePlayersPayload = buildSanitizedWritePayload({
        players: normalizedPlayers
      }, {
        lastActivity: serverTimestamp()
      });
      console.error('[joinRoom] Firestore write payload (normalize legacy players):', normalizePlayersPayload);
      await updateDoc(roomRef, normalizePlayersPayload);
      room.players = normalizedPlayers;
    }
    
    // Check if user is already in the room
    const existingPlayer = room.players?.find(p => p.id === userId);
    
    if (existingPlayer) {
      console.log('ℹ️ joinRoom: User already in room:', { userId, displayName: existingPlayer.displayName });
      setActiveRoomId(roomId);
      return room;
    }
    
    // Create new player
    const newPlayer = buildSerializablePlayer({
      id: userId,
      displayName: userDisplayName,
      photo: userPhoto ?? null,
      isHost: false,
      joinedAt: new Date().toISOString(),
      avatarColor: getAvatarColor({ id: userId, displayName: userDisplayName }, roomId) || null,
      displayNameForGame: null
    });
    const sanitizedNewPlayer = sanitize(newPlayer);
    
    // Add player to room
    console.log('👤 joinRoom: Adding new player to Firestore:', newPlayer);
    const joinPayload = buildSanitizedWritePayload({}, {
      players: arrayUnion(sanitizedNewPlayer)
    });
    console.error('[joinRoom] Firestore write payload (arrayUnion player):', joinPayload);
    await updateDoc(roomRef, joinPayload);
    console.log('✅ joinRoom: Player successfully added to Firestore');
    
    // Update lastActivity
    await updateLastActivity(roomRef);
    
    setActiveRoomId(roomId);
    console.log('✅ joinRoom: Active room ID set, ready to navigate');
    return room;
  } catch (error) {
    console.error('❌ joinRoom: Failed with error:', error.message, error);
    throw error;
  }
}

/**
 * Leave a room
 */
export async function leaveRoom(roomId, userId) {
  try {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) {
      clearActiveRoomId();
      return null;
    }
    
    const room = { id: roomDoc.id, ...roomDoc.data() };
    const wasHost = room.hostId === userId;
    const remainingPlayers = room.players?.filter((player) => player.id !== userId) || [];
    
    if (remainingPlayers.length === 0) {
      // Delete room if no players left
      await deleteDoc(roomRef);
      clearActiveRoomId();
      return null;
    }
    
    // If leaving player was host, reassign host to next player
    let updates = {};
    if (wasHost) {
      const nextHost = [...remainingPlayers].sort(
        (a, b) => getJoinedAtValue(a, room.createdAt) - getJoinedAtValue(b, room.createdAt)
      )[0];
      
      // Update all players to mark the new host
      const updatedPlayers = remainingPlayers.map((player) => buildSerializablePlayer({
        id: player?.id ?? null,
        displayName: player?.displayName ?? null,
        photo: player?.photo ?? player?.photoURL ?? null,
        isHost: player?.id === nextHost.id,
        joinedAt: player?.joinedAt ?? new Date().toISOString(),
        avatarColor: player?.avatarColor ?? null,
        displayNameForGame: player?.displayNameForGame ?? null
      }));
      
      updates.hostId = nextHost.id ?? null;
      updates.players = updatedPlayers;
    }
    
    // Remove the leaving player
    const playerToRemove = room.players.find(p => p.id === userId);
    if (playerToRemove) {
      const preRemovePayload = buildSanitizedWritePayload(updates, {
        lastActivity: serverTimestamp()
      });
      console.error('[leaveRoom] Firestore write payload (pre-remove update):', preRemovePayload);
      await updateDoc(roomRef, preRemovePayload);

      const removePayload = buildSanitizedWritePayload({}, {
        players: arrayRemove(sanitize(playerToRemove)),
        lastActivity: serverTimestamp()
      });
      console.error('[leaveRoom] Firestore write payload (remove player):', removePayload);
      await updateDoc(roomRef, removePayload);
    }
    
    clearActiveRoomId();
    return { id: roomDoc.id, ...room };
  } catch (error) {
    console.error('Error leaving room:', error);
    throw error;
  }
}

/**
 * Helper to update player's display name for just this games night
 */
export async function updatePlayerNameForGame(roomId, userId, gameDisplayName) {
  try {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (roomDoc.exists()) {
      const room = roomDoc.data();
      const playerIndex = room.players?.findIndex(p => p.id === userId);
      
      if (playerIndex !== undefined && playerIndex >= 0) {
        const updatedPlayers = [...room.players];
        updatedPlayers[playerIndex] = buildSerializablePlayer({
          ...updatedPlayers[playerIndex],
          displayNameForGame: gameDisplayName ?? null
        });
        
        const updateNamePayload = buildSanitizedWritePayload({
          players: updatedPlayers
        }, {
          lastActivity: serverTimestamp()
        });
        console.error('[updatePlayerNameForGame] Firestore write payload:', updateNamePayload);
        await updateDoc(roomRef, updateNamePayload);
      }
    }
  } catch (error) {
    console.error('Error updating player name for game:', error);
    throw error;
  }
}

/**
 * Start a vote activity
 */
export async function startVote(roomId, voteData) {
  try {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const activity = sanitize({
      ...(voteData || {}),
      createdAt: null
    });
    
    const startVotePayload = buildSanitizedWritePayload({
      activeActivity: activity
    }, {
      'activeActivity.createdAt': serverTimestamp(),
      lastActivity: serverTimestamp()
    });
    console.error('[startVote] Firestore write payload:', startVotePayload);
    await updateDoc(roomRef, startVotePayload);
  } catch (error) {
    console.error('Error starting vote:', error);
    throw error;
  }
}

/**
 * Cast a vote
 */
export async function castVote(roomId, userId, optionId) {
  try {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (roomDoc.exists()) {
      const room = roomDoc.data();
      if (room.activeActivity) {
        const votes = room.activeActivity.votes || {};
        votes[userId] = optionId ?? null;
        
        const castVotePayload = buildSanitizedWritePayload({
          'activeActivity.votes': sanitize(votes)
        }, {
          lastActivity: serverTimestamp()
        });
        console.error('[castVote] Firestore write payload:', castVotePayload);
        await updateDoc(roomRef, castVotePayload);
      }
    }
  } catch (error) {
    console.error('Error casting vote:', error);
    throw error;
  }
}

/**
 * End current activity
 */
export async function endActivity(roomId) {
  try {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const endActivityPayload = buildSanitizedWritePayload({
      activeActivity: null
    }, {
      lastActivity: serverTimestamp()
    });
    console.error('[endActivity] Firestore write payload:', endActivityPayload);
    await updateDoc(roomRef, endActivityPayload);
  } catch (error) {
    console.error('Error ending activity:', error);
    throw error;
  }
}

/**
 * Start a wheel activity
 */
export async function startWheel(roomId, wheelData) {
  try {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const activity = sanitize({
      type: wheelData?.type ?? null,
      options: Array.isArray(wheelData?.options) ? wheelData.options : [],
      state: 'idle',
      resultId: null,
      spinStartTime: null,
      spinDuration: null,
      createdAt: null
    });
    
    const startWheelPayload = buildSanitizedWritePayload({
      activeActivity: activity
    }, {
      'activeActivity.createdAt': serverTimestamp(),
      lastActivity: serverTimestamp()
    });
    console.error('[startWheel] Firestore write payload:', startWheelPayload);
    await updateDoc(roomRef, startWheelPayload);
  } catch (error) {
    console.error('Error starting wheel:', error);
    throw error;
  }
}

/**
 * Spin the wheel (host only)
 */
export async function spinWheel(roomId) {
  try {
    const roomRef = doc(db, ROOMS_COLLECTION, roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) return null;
    
    const room = roomDoc.data();
    if (room.activeActivity && (room.activeActivity.type === 'playerWheel' || room.activeActivity.type === 'customWheel')) {
      const activity = room.activeActivity;
      
      // Generate truly random result using crypto
      const randomValues = new Uint32Array(1);
      crypto.getRandomValues(randomValues);
      const randomIndex = randomValues[0] % activity.options.length;
      const resultId = activity.options[randomIndex].id;
      
      // Generate random spin duration between 4 and 8 seconds
      const durationArray = new Uint32Array(1);
      crypto.getRandomValues(durationArray);
      const duration = 4000 + (durationArray[0] % 4000);
      
      const now = Date.now();
      
      const spinStartPayload = buildSanitizedWritePayload({
        'activeActivity.state': 'spinning',
        'activeActivity.resultId': resultId ?? null,
        'activeActivity.spinStartTime': now ?? null,
        'activeActivity.spinDuration': duration ?? null
      }, {
        lastActivity: serverTimestamp()
      });
      console.error('[spinWheel] Firestore write payload (spin start):', spinStartPayload);
      await updateDoc(roomRef, spinStartPayload);
      
      // Schedule state change to 'result' after spin completes
      setTimeout(() => {
        const spinResultPayload = buildSanitizedWritePayload({
          'activeActivity.state': 'result'
        }, {
          lastActivity: serverTimestamp()
        });
        console.error('[spinWheel] Firestore write payload (spin result):', spinResultPayload);
        updateDoc(roomRef, spinResultPayload).catch(error => console.error('Error updating wheel state:', error));
      }, duration + 100);
    }
  } catch (error) {
    console.error('Error spinning wheel:', error);
    throw error;
  }
}

/**
 * Hook for loading active room with real-time updates
 */
export function useActiveRoom(userId) {
  const [activeRoom, setActiveRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expiredMessage, setExpiredMessage] = useState('');

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let unsubscribe = null;

    const loadActiveRoom = async () => {
      try {
        const activeRoomId = getActiveRoomId();
        
        if (activeRoomId) {
          // Check if room exists and user is a member
          const roomRef = doc(db, ROOMS_COLLECTION, activeRoomId);
          const roomDoc = await getDoc(roomRef);
          
          if (roomDoc.exists()) {
            const room = { id: roomDoc.id, ...roomDoc.data() };
            const isMember = room.players?.some((player) => player.id === userId);
            
            if (!isMember) {
              clearActiveRoomId();
              setActiveRoom(null);
              setLoading(false);
              return;
            }
            
            // Check if room is expired
            if (isRoomExpired(room)) {
              await deleteDoc(roomRef);
              clearActiveRoomId();
              setExpiredMessage('This room has expired.');
              setActiveRoom(null);
              setLoading(false);
              return;
            }
            
            // Set up real-time listener
            unsubscribe = onSnapshot(roomRef, (doc) => {
              if (doc.exists()) {
                const updatedRoom = { id: doc.id, ...doc.data() };
                setActiveRoom(updatedRoom);
                setExpiredMessage('');
              } else {
                clearActiveRoomId();
                setActiveRoom(null);
              }
            }, (error) => {
              console.error('Error listening to active room:', error);
            });
            
            setLoading(false);
            return;
          }
        }
        
        // No active room found
        clearActiveRoomId();
        setActiveRoom(null);
        setLoading(false);
      } catch (error) {
        console.error('Error loading active room:', error);
        setLoading(false);
      }
    };

    loadActiveRoom();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId]);

  return { activeRoom, loading, expiredMessage };
}

/**
 * Hook for loading a specific room with real-time updates
 */
export function useRoom(roomId, userId = null, userDisplayName = null, userPhoto = null) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!roomId) {
      console.warn('⚠️ useRoom: no roomId provided');
      setLoading(false);
      return;
    }
    
    console.log('📍 useRoom: Setting up listener for roomId:', roomId);

    let unsubscribe = null;

    const setupRoomListener = async () => {
      try {
        const roomRef = doc(db, ROOMS_COLLECTION, roomId);
        console.log('🔍 useRoom: Fetching initial room data...');
        const roomDoc = await getDoc(roomRef);

        if (!roomDoc.exists()) {
          console.error('❌ useRoom: Room document does not exist for roomId:', roomId);
          setError('Room not found');
          setRoom(null);
          setLoading(false);
          return;
        }

        const room = { id: roomDoc.id, ...roomDoc.data() };
        console.log('✅ useRoom: Room found:', { roomId, players: room.players?.length || 0 });

        // Check if room is expired
        if (isRoomExpired(room)) {
          await deleteDoc(roomRef);
          clearActiveRoomId();
          setRoom(null);
          setError('This room has expired');
          setLoading(false);
          return;
        }

        // If we have user info and user is not in the room, add them
        if (userId && userDisplayName) {
          const existingPlayer = room.players?.find(p => p.id === userId);
          if (!existingPlayer) {
            const newPlayer = buildSerializablePlayer({
              id: userId,
              displayName: userDisplayName,
              photo: userPhoto ?? null,
              isHost: false,
              joinedAt: new Date().toISOString(),
              avatarColor: getAvatarColor({ id: userId, displayName: userDisplayName }, roomId) || null,
              displayNameForGame: null
            });
            console.log('[useRoom] auto-adding player payload:', newPlayer);
            const autoAddPayload = buildSanitizedWritePayload({}, {
              players: arrayUnion(sanitize(newPlayer))
            });
            console.error('[useRoom] Firestore write payload (auto-add player):', autoAddPayload);
            
            await updateDoc(roomRef, autoAddPayload);
          }
        }

        setActiveRoomId(roomId);
        console.log('📡 useRoom: Setting up real-time listener...');

        // Set up real-time listener
        console.log('📡 useRoom: onSnapshot listener attaching to roomRef:', roomId);
        unsubscribe = onSnapshot(roomRef, (snapshoot) => {
          if (snapshoot.exists()) {
            const updatedRoom = { id: snapshoot.id, ...snapshoot.data() };
            
            // Check if room has expired while listening
            if (isRoomExpired(updatedRoom)) {
              deleteDoc(roomRef).catch(error => console.error('Error deleting expired room:', error));
              clearActiveRoomId();
              setError('This room has expired');
              setRoom(null);
              return;
            }

            const activeActivity = updatedRoom.activeActivity;
            const isLobbyPhase = activeActivity?.phase === 'lobby';
            const hasLobbyPlayers = Array.isArray(activeActivity?.lobbyPlayers);

            if (isLobbyPhase && hasLobbyPlayers) {
              const roomPlayers = Array.isArray(updatedRoom.players) ? updatedRoom.players : [];
              const roomPlayerIds = roomPlayers.map((player) => player.id).filter(Boolean);
              const lobbyPlayers = activeActivity.lobbyPlayers;
              const spectators = Array.isArray(activeActivity.spectators) ? activeActivity.spectators : [];
              const isWordImposterLobby = activeActivity?.type === 'wordImposter';
              const rawActivityPlayers = Array.isArray(activeActivity.players) ? activeActivity.players : [];
              const activityPlayers = isWordImposterLobby
                ? rawActivityPlayers
                  .filter((player) => player?.uid)
                  .map((player) => ({
                    uid: player.uid ?? null,
                    displayName: player.displayName ?? null,
                    avatarColor: player.avatarColor || getAvatarColor({ id: player.uid, displayName: player.displayName }, roomId) || null
                  }))
                : rawActivityPlayers;
              const activityPlayerIds = activityPlayers.map((player) => player.uid).filter(Boolean);
              const hasWordImposterPlayerBloat = isWordImposterLobby && rawActivityPlayers.some((player) => {
                if (!player || typeof player !== 'object') return false;
                return 'photoURL' in player || 'photo' in player || 'avatar' in player || 'isAlive' in player || 'role' in player;
              });

              // Find players who joined the room but aren't in lobby yet
              const missingLobbyPlayers = roomPlayerIds.filter(
                (playerId) => !lobbyPlayers.includes(playerId) && !spectators.includes(playerId)
              );
              const missingActivityPlayers = roomPlayers
                .filter((player) => !activityPlayerIds.includes(player.id))
                .map((player) => {
                  if (isWordImposterLobby) {
                    return {
                      uid: player.id ?? null,
                      displayName: player.displayNameForGame || player.displayName || null,
                      avatarColor: player.avatarColor || getAvatarColor(player, roomId) || null
                    };
                  }

                  return {
                    uid: player.id ?? null,
                    displayName: player.displayNameForGame || player.displayName || null,
                    avatarColor: player.avatarColor || getAvatarColor(player, roomId) || null,
                    isAlive: true,
                    role: null
                  };
                });

              // Find players who left the room but are still in lobby arrays
              const departedLobbyPlayers = lobbyPlayers.filter(
                (playerId) => !roomPlayerIds.includes(playerId)
              );
              const departedActivityPlayers = activityPlayers.filter(
                (player) => !roomPlayerIds.includes(player.uid)
              );
              const departedSpectators = spectators.filter(
                (playerId) => !roomPlayerIds.includes(playerId)
              );

              const needsUpdate = missingLobbyPlayers.length > 0 || 
                                  missingActivityPlayers.length > 0 || 
                                  departedLobbyPlayers.length > 0 || 
                                  departedActivityPlayers.length > 0 ||
                                  departedSpectators.length > 0 ||
                                  hasWordImposterPlayerBloat;

              if (needsUpdate) {
                const updates = {};
                const fieldValueUpdates = {
                  lastActivity: serverTimestamp()
                };

                if (missingLobbyPlayers.length > 0) {
                  console.log('➕ useRoom: Auto-adding missing lobby players:', missingLobbyPlayers);
                  fieldValueUpdates['activeActivity.lobbyPlayers'] = arrayUnion(...sanitize(missingLobbyPlayers));
                }

                if (departedLobbyPlayers.length > 0) {
                  console.log('➖ useRoom: Removing departed lobby players:', departedLobbyPlayers);
                  // Need to set the entire array since we can't use arrayRemove with arrayUnion in same update
                  const updatedLobbyPlayers = [
                    ...lobbyPlayers.filter((id) => !departedLobbyPlayers.includes(id)),
                    ...(missingLobbyPlayers.length > 0 ? missingLobbyPlayers : [])
                  ];
                  updates['activeActivity.lobbyPlayers'] = updatedLobbyPlayers;
                  delete fieldValueUpdates['activeActivity.lobbyPlayers'];
                }

                const updatedActivityPlayers = [
                  ...activityPlayers.filter((player) => !departedActivityPlayers.some((dp) => dp.uid === player.uid)),
                  ...missingActivityPlayers
                ];

                if (missingActivityPlayers.length > 0 || departedActivityPlayers.length > 0 || hasWordImposterPlayerBloat) {
                  if (missingActivityPlayers.length > 0) {
                    console.log('➕ useRoom: Auto-syncing missing activity players:', missingActivityPlayers.map((p) => p.uid));
                  }
                  if (departedActivityPlayers.length > 0) {
                    console.log('➖ useRoom: Removing departed activity players:', departedActivityPlayers.map((p) => p.uid));
                  }
                  if (hasWordImposterPlayerBloat) {
                    console.log('🧹 useRoom: Stripping heavy fields from Word Imposter activity players');
                  }
                  updates['activeActivity.players'] = updatedActivityPlayers;
                }

                if (departedSpectators.length > 0) {
                  console.log('➖ useRoom: Removing departed spectators:', departedSpectators);
                  updates['activeActivity.spectators'] = spectators.filter((id) => !departedSpectators.includes(id));
                }

                const autoSyncPayload = buildSanitizedWritePayload(updates, fieldValueUpdates);
                console.error('[useRoom] Firestore write payload (auto-sync lobby/activity):', autoSyncPayload);
                updateDoc(roomRef, autoSyncPayload).catch(error => {
                  console.error('❌ useRoom: Failed to auto-sync lobby/activity players:', error);
                });
              }
            }
            
            console.log('🔄 useRoom: Room snapshot received - players count:', updatedRoom.players?.length || 0, updatedRoom.players?.map(p => p.displayName) || []);
            setRoom(updatedRoom);
            setError(null);
          } else {
            console.error('❌ useRoom listener: Room no longer exists:', roomId);
            setError('Room not found');
            setRoom(null);
          }
        }, (error) => {
          console.error('❌ useRoom listener error:', error);
          setError('Failed to load room');
        });

        console.log('✅ useRoom: Listener setup complete, setting loading to false');
        setLoading(false);
      } catch (error) {
        console.error('Error setting up room listener:', error);
        setError('Failed to load room');
        setLoading(false);
      }
    };

    setupRoomListener();

    // Cleanup listener on unmount
    return () => {
      console.log('🧹 useRoom: Cleaning up listener for roomId:', roomId);
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [roomId]);

  const isHost = room && userId && room.hostId === userId;

  return { room, loading, error, isHost };
}
