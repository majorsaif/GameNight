import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const NICKNAME_KEY = 'gamenight_nickname';
const PROFILE_KEY = 'gamenight_profile';

/**
 * Authentication hook using Firebase anonymous auth
 * Uses Firebase Auth as the source of truth for user UID
 * Caches nickname and profile data in localStorage
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
        
        // Get profile data from localStorage
        let profileData = {};
        try {
          const storedProfile = localStorage.getItem(PROFILE_KEY);
          if (storedProfile) {
            profileData = JSON.parse(storedProfile);
          }
        } catch (e) {
          console.error('Error loading profile data:', e);
        }
        
        if (nickname) {
          setHasNickname(true);
          setUser({
            id: uid,
            displayName: nickname,
            isAnonymous: true,
            avatar: profileData.avatar || null,
            favouriteGame: profileData.favouriteGame || '',
            memberSince: profileData.memberSince || new Date().toISOString()
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
    
    // Initialize profile data with memberSince if it doesn't exist
    const existingProfile = localStorage.getItem(PROFILE_KEY);
    if (!existingProfile) {
      const initialProfile = {
        memberSince: new Date().toISOString()
      };
      localStorage.setItem(PROFILE_KEY, JSON.stringify(initialProfile));
    }
    
    // Update user state if auth is ready
    if (auth.currentUser) {
      const profileData = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
      setUser({
        id: auth.currentUser.uid,
        displayName: trimmedNickname,
        isAnonymous: true,
        avatar: profileData.avatar || null,
        favouriteGame: profileData.favouriteGame || '',
        memberSince: profileData.memberSince || new Date().toISOString()
      });
    }
    setHasNickname(true);
  }, []);

  const clearNickname = useCallback(() => {
    localStorage.removeItem(NICKNAME_KEY);
    setHasNickname(false);
    setUser(null);
  }, []);

  const logout = useCallback(() => {
    // Clear all user data from localStorage
    localStorage.removeItem(NICKNAME_KEY);
    localStorage.removeItem(PROFILE_KEY);
    setHasNickname(false);
    setUser(null);
  }, []);

  const updateProfile = useCallback((updates) => {
    try {
      // Get current profile data
      let profileData = {};
      const storedProfile = localStorage.getItem(PROFILE_KEY);
      if (storedProfile) {
        profileData = JSON.parse(storedProfile);
      }
      
      // Merge updates
      const updatedProfile = {
        ...profileData,
        ...updates
      };
      
      // Save to localStorage
      localStorage.setItem(PROFILE_KEY, JSON.stringify(updatedProfile));
      
      // If nickname is being updated, also update the NICKNAME_KEY
      if (updates.displayName) {
        localStorage.setItem(NICKNAME_KEY, updates.displayName);
      }
      
      // Update user state if auth is ready
      if (auth.currentUser && user) {
        setUser({
          ...user,
          ...updates
        });
      }
    } catch (e) {
      console.error('Error updating profile:', e);
    }
  }, [user]);

  return { user, loading, hasNickname, setNickname, clearNickname, logout, updateProfile };
}
