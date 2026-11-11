import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import {
  clearLocalProfile,
  deleteProfile,
  primePhotoCache,
  readLocalProfile,
  saveLocalName,
  saveLocalPhoto,
  syncProfilePhoto
} from '../lib/profiles';

const AuthContext = createContext(null);

/**
 * Single source of truth for the (anonymous) user.
 * - Firebase anonymous auth gives a stable uid per device.
 * - Name + photo live in localStorage; the photo is mirrored to profiles/{uid}.
 */
export function AuthProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [profile, setProfile] = useState(() => readLocalProfile());

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (cancelled) return;
      if (firebaseUser) {
        setUid(firebaseUser.uid);
        setAuthError(null);
        setAuthReady(true);
        return;
      }
      try {
        await signInAnonymously(auth);
        // onAuthStateChanged fires again with the new user
      } catch (error) {
        console.error('Anonymous sign-in failed:', error);
        setAuthError(error);
        setAuthReady(true);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Keep the cloud copy of the profile photo in sync (no-op when unchanged)
  useEffect(() => {
    if (!uid) return;
    if (profile.photo && profile.photoVersion) primePhotoCache(uid, profile.photoVersion, profile.photo);
    syncProfilePhoto(uid).catch((error) => console.warn('Profile photo sync failed:', error));
  }, [uid, profile.photo, profile.photoVersion]);

  const setNickname = useCallback((name) => {
    const clean = saveLocalName(name);
    if (!clean) return;
    setProfile(readLocalProfile());
  }, []);

  const updateProfile = useCallback((updates = {}) => {
    if (typeof updates.displayName === 'string') saveLocalName(updates.displayName);
    if (updates.photo !== undefined) saveLocalPhoto(updates.photo || null);
    setProfile(readLocalProfile());
  }, []);

  const logout = useCallback(async () => {
    await deleteProfile(auth.currentUser?.uid);
    clearLocalProfile();
    setProfile(readLocalProfile());
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  }, []);

  const hasNickname = Boolean(profile.displayName);
  const user = useMemo(() => {
    if (!uid || !hasNickname) return null;
    return {
      id: uid,
      displayName: profile.displayName,
      photo: profile.photo,
      photoVersion: profile.photoVersion,
      isAnonymous: true
    };
  }, [uid, hasNickname, profile.displayName, profile.photo, profile.photoVersion]);

  const value = useMemo(() => ({
    user,
    uid,
    loading: !authReady,
    authError,
    hasNickname,
    setNickname,
    updateProfile,
    logout
  }), [user, uid, authReady, authError, hasNickname, setNickname, updateProfile, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
