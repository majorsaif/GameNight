import { useState, useEffect, useCallback } from 'react';

const NICKNAME_KEY = 'gamenight_nickname';

/**
 * Mock authentication hook
 * Uses sessionStorage for tab-specific UIDs - each tab simulates a different player
 * Uses localStorage for persistent nickname across sessions
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
    
    if (nickname) {
      setHasNickname(true);
      setUser({
        id: uid,
        displayName: nickname,
        isAnonymous: true
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
    
    // Reload user with new nickname
    loadUser();
  }, [loadUser]);

  const clearNickname = useCallback(() => {
    localStorage.removeItem(NICKNAME_KEY);
    setHasNickname(false);
    setUser(null);
  }, []);

  return { user, loading, hasNickname, setNickname, clearNickname };
}
