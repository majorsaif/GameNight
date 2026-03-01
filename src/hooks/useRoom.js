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
const ACTIVE_ROOM_KEY = 'gamenight_active_room';

function setActiveRoomId(roomId) {
  if (roomId) {
    sessionStorage.setItem(ACTIVE_ROOM_KEY, roomId);
  }
}

function getActiveRoomId() {
  return sessionStorage.getItem(ACTIVE_ROOM_KEY);
}

function clearActiveRoomId() {
  sessionStorage.removeItem(ACTIVE_ROOM_KEY);
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
    await updateDoc(roomRef, {
      lastActivity: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating lastActivity:', error);
  }
}

/**
 * Create a new room in Firestore
 */
export async function createRoom(hostId, hostDisplayName) {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const now = new Date().toISOString();
  
  const hostPlayer = { 
    id: hostId, 
    displayName: hostDisplayName, 
    isHost: true, 
    joinedAt: now,
    avatarColor: null
  };
  
  const roomData = {
    code: code,
    hostId: hostId,
    players: [hostPlayer],
    createdAt: serverTimestamp(),
    lastActivity: serverTimestamp(),
    activeActivity: null
  };
  
  try {
    const docRef = await addDoc(collection(db, ROOMS_COLLECTION), roomData);
    const createdRoomId = docRef.id;
    console.log('✅ Room created successfully:', { docId: createdRoomId, code: code });
    
    // Generate avatar color after room is created (we need the room ID)
    hostPlayer.avatarColor = getAvatarColor(hostPlayer, createdRoomId);
    await updateDoc(docRef, { players: [hostPlayer] });
    
    setActiveRoomId(createdRoomId);
    
    const result = { id: createdRoomId, code, ...roomData };
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
export async function joinRoom(roomId, userId, userDisplayName) {
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
    
    // Check if user is already in the room
    const existingPlayer = room.players?.find(p => p.id === userId);
    
    if (existingPlayer) {
      console.log('ℹ️ joinRoom: User already in room:', { userId, displayName: existingPlayer.displayName });
      setActiveRoomId(roomId);
      return room;
    }
    
    // Create new player
    const newPlayer = {
      id: userId,
      displayName: userDisplayName,
      isHost: false,
      joinedAt: new Date().toISOString(),
      avatarColor: getAvatarColor({ id: userId, displayName: userDisplayName }, roomId)
    };
    
    // Add player to room
    console.log('👤 joinRoom: Adding new player to Firestore:', { userId, displayName: userDisplayName });
    await updateDoc(roomRef, {
      players: arrayUnion(newPlayer)
    });
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
      const updatedPlayers = remainingPlayers.map((player) => ({
        ...player,
        isHost: player.id === nextHost.id
      }));
      
      updates.hostId = nextHost.id;
      updates.players = updatedPlayers;
      updates.lastActivity = serverTimestamp();
    } else {
      updates.lastActivity = serverTimestamp();
    }
    
    // Remove the leaving player
    const playerToRemove = room.players.find(p => p.id === userId);
    if (playerToRemove) {
      if (Object.keys(updates).length > 0) {
        await updateDoc(roomRef, updates);
      }
      await updateDoc(roomRef, {
        players: arrayRemove(playerToRemove),
        lastActivity: serverTimestamp()
      });
    }
    
    clearActiveRoomId();
    return { id: roomDoc.id, ...room };
  } catch (error) {
    console.error('Error leaving room:', error);
    throw error;
  }
}

/**
 * Helper to update player's display name for just this game night
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
        updatedPlayers[playerIndex] = {
          ...updatedPlayers[playerIndex],
          displayNameForGame: gameDisplayName
        };
        
        await updateDoc(roomRef, {
          players: updatedPlayers,
          lastActivity: serverTimestamp()
        });
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
    const activity = {
      ...voteData,
      createdAt: serverTimestamp()
    };
    
    await updateDoc(roomRef, {
      activeActivity: activity,
      lastActivity: serverTimestamp()
    });
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
        votes[userId] = optionId;
        
        await updateDoc(roomRef, {
          'activeActivity.votes': votes,
          lastActivity: serverTimestamp()
        });
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
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp()
    });
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
    const activity = {
      type: wheelData.type,
      options: wheelData.options,
      state: 'idle',
      resultId: null,
      spinStartTime: null,
      spinDuration: null,
      createdAt: serverTimestamp()
    };
    
    await updateDoc(roomRef, {
      activeActivity: activity,
      lastActivity: serverTimestamp()
    });
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
      
      await updateDoc(roomRef, {
        'activeActivity.state': 'spinning',
        'activeActivity.resultId': resultId,
        'activeActivity.spinStartTime': now,
        'activeActivity.spinDuration': duration,
        lastActivity: serverTimestamp()
      });
      
      // Schedule state change to 'result' after spin completes
      setTimeout(() => {
        updateDoc(roomRef, {
          'activeActivity.state': 'result',
          lastActivity: serverTimestamp()
        }).catch(error => console.error('Error updating wheel state:', error));
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
export function useRoom(roomId, userId = null, userDisplayName = null, userAvatar = null) {
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
            const newPlayer = {
              id: userId,
              displayName: userDisplayName,
              avatar: userAvatar,
              isHost: false,
              joinedAt: new Date().toISOString(),
              avatarColor: getAvatarColor({ id: userId, displayName: userDisplayName }, roomId)
            };
            
            await updateDoc(roomRef, {
              players: arrayUnion(newPlayer)
            });
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
