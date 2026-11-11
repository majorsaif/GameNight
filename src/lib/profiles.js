import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Profile photos live in their own small documents (profiles/{uid}) instead of
// inside every room document. Room snapshots are sent to every player on every
// change, so keeping photos out of them cuts Firestore bandwidth dramatically.

export const NICKNAME_KEY = 'gamenight_nickname';
export const PHOTO_KEY = 'gamenight_photo';
export const PHOTO_VERSION_KEY = 'gamenight_photo_version';
export const PHOTO_SYNCED_KEY = 'gamenight_photo_synced';
export const MAX_NAME_LENGTH = 20;

const memoryCache = new Map(); // `${uid}:${version}` -> photo | null
const inflight = new Map();

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage full or disabled (private mode) - non fatal
  }
}

export function readLocalProfile() {
  const displayName = (safeGet(NICKNAME_KEY) || '').trim().slice(0, MAX_NAME_LENGTH);
  const photo = safeGet(PHOTO_KEY) || null;
  const versionRaw = Number(safeGet(PHOTO_VERSION_KEY));
  const photoVersion = photo ? (Number.isFinite(versionRaw) && versionRaw > 0 ? versionRaw : 1) : null;
  return { displayName, photo, photoVersion };
}

export function saveLocalName(name) {
  const clean = sanitizeName(name);
  if (clean) safeSet(NICKNAME_KEY, clean);
  return clean;
}

export function saveLocalPhoto(photo) {
  if (photo) {
    const version = Date.now();
    safeSet(PHOTO_KEY, photo);
    safeSet(PHOTO_VERSION_KEY, String(version));
    return version;
  }
  safeSet(PHOTO_KEY, null);
  safeSet(PHOTO_VERSION_KEY, null);
  return null;
}

export function clearLocalProfile() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gamenight_')) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore
  }
}

export function sanitizeName(name) {
  if (typeof name !== 'string') return '';
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

/**
 * Makes sure the signed-in user's profile doc matches their local photo.
 * Only writes when something changed, so it costs nothing on most visits.
 */
export async function syncProfilePhoto(uid) {
  if (!uid) return;
  const { photo, photoVersion } = readLocalProfile();
  const syncedMarker = `${uid}:${photoVersion || 'none'}`;
  if (safeGet(PHOTO_SYNCED_KEY) === syncedMarker) return;

  const ref = doc(db, 'profiles', uid);
  if (photo) {
    await setDoc(ref, { photo, updatedAt: serverTimestamp() });
    memoryCache.set(`${uid}:${photoVersion}`, photo);
  } else {
    await deleteDoc(ref).catch(() => {});
  }
  safeSet(PHOTO_SYNCED_KEY, syncedMarker);
}

/**
 * Fetches a player's photo once per (uid, version) and caches it in memory.
 */
export async function fetchProfilePhoto(uid, version) {
  if (!uid || !version) return null;
  const key = `${uid}:${version}`;
  if (memoryCache.get(key)) return memoryCache.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const promise = getDoc(doc(db, 'profiles', uid))
    .then((snap) => {
      const photo = snap.exists() && typeof snap.data().photo === 'string' ? snap.data().photo : null;
      // Only cache hits: the owner may still be uploading, so a miss can be retried later
      if (photo) memoryCache.set(key, photo);
      return photo;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export function getCachedPhoto(uid, version) {
  if (!uid || !version) return null;
  return memoryCache.get(`${uid}:${version}`) ?? null;
}

export function primePhotoCache(uid, version, photo) {
  if (uid && version && photo) memoryCache.set(`${uid}:${version}`, photo);
}

export async function deleteProfile(uid) {
  if (!uid) return;
  await deleteDoc(doc(db, 'profiles', uid)).catch(() => {});
}
