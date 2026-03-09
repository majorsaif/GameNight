import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

const ROOMS_COLLECTION = 'rooms';
const ROOM_EXPIRY_MS = 12 * 60 * 60 * 1000;

let hasRunCleanup = false;

export async function cleanupExpiredRoomsOnLoad() {
  if (hasRunCleanup) return;
  hasRunCleanup = true;

  const cutoffTimestamp = Timestamp.fromDate(new Date(Date.now() - ROOM_EXPIRY_MS));
  const roomsRef = collection(db, ROOMS_COLLECTION);

  try {
    const [lastActivitySnapshot, createdAtSnapshot] = await Promise.all([
      getDocs(query(roomsRef, where('lastActivity', '<', cutoffTimestamp))),
      getDocs(query(roomsRef, where('createdAt', '<', cutoffTimestamp))),
    ]);

    const roomIdsToDelete = new Set();

    lastActivitySnapshot.forEach((snapshotDoc) => {
      roomIdsToDelete.add(snapshotDoc.id);
    });

    createdAtSnapshot.forEach((snapshotDoc) => {
      const room = snapshotDoc.data();
      if (!room.lastActivity) {
        roomIdsToDelete.add(snapshotDoc.id);
      }
    });

    if (roomIdsToDelete.size === 0) return;

    const batch = writeBatch(db);
    roomIdsToDelete.forEach((roomId) => {
      batch.delete(doc(db, ROOMS_COLLECTION, roomId));
    });

    await batch.commit();
    console.log(`🧹 Startup cleanup deleted ${roomIdsToDelete.size} expired room(s)`);
  } catch (error) {
    console.error('Failed startup room cleanup:', error);
  }
}