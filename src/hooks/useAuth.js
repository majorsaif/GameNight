import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';

const NICKNAME_KEY = 'gamenight_nickname';
const PHOTO_KEY = 'gamenight_photo';

/**
 * Authentication hook using Firebase anonymous auth
 * Uses Firebase Auth silently in the background
 * Uses localStorage for nickname and photo
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasNickname, setHasNickname] = useState(false);

  useEffect(() => {
    // Set up auth state listener
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        const uid = firebaseUser.uid;
        const nickname = localStorage.getItem(NICKNAME_KEY);
        const photo = localStorage.getItem(PHOTO_KEY);
        
        if (nickname) {
          setHasNickname(true);
          setUser({
            id: uid,
            displayName: nickname,
            photo: photo || null,
            isAnonymous: true
          });
        } else {
          setHasNickname(false);
          setUser(null);
        }
      } else {
        // User is signed out - attempt to sign in anonymously
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error('Error signing in anonymously:', error);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);


  const setNickname = useCallback((nickname) => {
    if (!nickname || !nickname.trim()) return;
    
    const trimmedNickname = nickname.trim();
    localStorage.setItem(NICKNAME_KEY, trimmedNickname);
    
    // Update user state if auth is ready
    if (auth.currentUser) {
      const photo = localStorage.getItem(PHOTO_KEY);
      setUser({
        id: auth.currentUser.uid,
        displayName: trimmedNickname,
        photo: photo || null,
        isAnonymous: true
      });
    }
    setHasNickname(true);
  }, []);

  const clearNickname = useCallback(() => {
    localStorage.removeItem(NICKNAME_KEY);
    setHasNickname(false);
    setUser(null);
  }, []);

  const logout = useCallback(async () => {
    // Clear all gamenight_* keys from localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('gamenight_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    setHasNickname(false);
    setUser(null);
    
    // Sign out of Firebase and sign back in anonymously
    try {
      await signOut(auth);
      await signInAnonymously(auth);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }, []);

  const updateProfile = useCallback((updates) => {
    try {
      // Update nickname if provided
      if (updates.displayName) {
        localStorage.setItem(NICKNAME_KEY, updates.displayName);
      }
      
      // Update photo if provided
      if (updates.photo !== undefined) {
        if (updates.photo) {
          localStorage.setItem(PHOTO_KEY, updates.photo);
        } else {
          localStorage.removeItem(PHOTO_KEY);
        }
      }
      
      // Update user state if auth is ready
      if (auth.currentUser && user) {
        const nickname = updates.displayName || user.displayName;
        const photo = updates.photo !== undefined ? updates.photo : user.photo;
        
        setUser({
          id: auth.currentUser.uid,
          displayName: nickname,
          photo: photo,
          isAnonymous: true
        });
      }
    } catch (e) {
      console.error('Error updating profile:', e);
    }
  }, [user]);

  return { user, loading, hasNickname, setNickname, clearNickname, logout, updateProfile };
}
