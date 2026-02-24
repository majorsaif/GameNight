import { useState, useEffect, useCallback } from 'react';

const NICKNAME_KEY = 'gamenight_nickname';
const PROFILE_KEY = 'gamenight_profile';

/**
 * Mock authentication hook
 * Uses sessionStorage for tab-specific UIDs - each tab simulates a different player
 * Uses localStorage for persistent nickname and profile across sessions
 * Will be replaced with Firebase anonymous auth later
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasNickname, setHasNickname] = useState(false);

  const loadUser = useCallback(() => {
    // Check if this tab already has a UID (sessionStorage is tab-specific)
    let uid = sessionStorage.getItem('gamenight_uid');
    
    if (!uid) {
      // Generate a new UID for this tab
      uid = 'user-' + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('gamenight_uid', uid);
    }

    // Get nickname from localStorage (persistent across tabs/sessions)
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
    
    setLoading(false);
  }, []);

  useEffect(() => {
    // Simulate async auth check
    setTimeout(loadUser, 100);
  }, [loadUser]);

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
    
    // Reload user with new nickname
    loadUser();
  }, [loadUser]);

  const clearNickname = useCallback(() => {
    localStorage.removeItem(NICKNAME_KEY);
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
      
      // Reload user
      loadUser();
    } catch (e) {
      console.error('Error updating profile:', e);
    }
  }, [loadUser]);

  return { user, loading, hasNickname, setNickname, clearNickname, updateProfile };
}
