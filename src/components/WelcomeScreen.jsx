import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createRoom, findRoomByCode, updatePlayerNameForGame } from '../hooks/useRoom';

export default function WelcomeScreen() {
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [guestNameInput, setGuestNameInput] = useState('');
  const [showGuestInput, setShowGuestInput] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [savedGuestName, setSavedGuestName] = useState(
    () => localStorage.getItem('gamenight_nickname') || ''
  );
  const [showAuthModal, setShowAuthModal] = useState(
    () => !localStorage.getItem('gamenight_nickname')
  );
  const [showHostDialog, setShowHostDialog] = useState(false);
  const [hostGameName, setHostGameName] = useState('');
  const [showJoinRenameModal, setShowJoinRenameModal] = useState(false);
  const [pendingJoinRoomId, setPendingJoinRoomId] = useState(null);
  const [joinGameName, setJoinGameName] = useState('');
  const navigate = useNavigate();
  const { user, loading, hasNickname, setNickname } = useAuth();
  const inputRefs = useRef([]);

  useEffect(() => {
    setShowAuthModal(!hasNickname);
  }, [hasNickname]);

  const handleHostGame = () => {
    setHostGameName(user?.displayName || '');
    setShowHostDialog(true);
  };

  const handleConfirmHostGame = () => {
    if (!user) return;
    
    // Create a new room with the default name
    const room = createRoom(user.id, user.displayName);
    
    // Set host's game-specific name if provided
    if (hostGameName.trim()) {
      updatePlayerNameForGame(room.id, user.id, hostGameName.trim());
    }
    
    setShowHostDialog(false);
    setHostGameName('');
    navigate(`/room/${room.id}`);
  };

  const handleDigitChange = (index, value) => {
    // Only allow alphanumeric characters
    const sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    if (sanitized.length > 0) {
      const newDigits = [...codeDigits];
      newDigits[index] = sanitized[0];
      setCodeDigits(newDigits);
      
      // Move to next input
      if (index < 5) {
        inputRefs.current[index + 1]?.focus();
      }
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (codeDigits[index] === '' && index > 0) {
        // Move to previous input if current is empty
        inputRefs.current[index - 1]?.focus();
      } else {
        // Clear current digit
        const newDigits = [...codeDigits];
        newDigits[index] = '';
        setCodeDigits(newDigits);
      }
    }
  };

  const handleDigitPaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const newDigits = [...codeDigits];
    
    for (let i = 0; i < Math.min(pastedText.length, 6); i++) {
      newDigits[i] = pastedText[i];
    }
    
    setCodeDigits(newDigits);
  };

  const handleJoinGame = (e) => {
    e.preventDefault();
    const code = codeDigits.join('');
    if (code.length === 6) {
      // Find room by code
      const room = findRoomByCode(code);
      if (room) {
        // Show rename modal before joining
        setPendingJoinRoomId(room.id);
        setJoinGameName(user?.displayName || '');
        setShowJoinRenameModal(true);
      } else {
        alert('Room not found. Please check the code and try again.');
      }
    }
  };

  const handleConfirmJoin = () => {
    if (!pendingJoinRoomId || !user) return;
    
    // Set player's game-specific name if provided and different from profile name
    if (joinGameName.trim() && joinGameName.trim() !== user.displayName) {
      updatePlayerNameForGame(pendingJoinRoomId, user.id, joinGameName.trim());
    }
    
    setShowJoinRenameModal(false);
    setPendingJoinRoomId(null);
    setJoinGameName('');
    setCodeDigits(['', '', '', '', '', '']);
    navigate(`/room/${pendingJoinRoomId}`);
  };

  const handleJoinAsGuest = () => {
    if (!guestNameInput.trim()) return;
    const trimmedName = guestNameInput.trim();
    localStorage.setItem('gamenight_auth_type', 'guest');
    setNickname(trimmedName);
    setSavedGuestName(trimmedName);
    setShowGuestInput(false);
    setGuestNameInput('');
    setShowAuthModal(false);
  };

  const handleContinueAsGuest = () => {
    if (!savedGuestName) return;
    localStorage.setItem('gamenight_auth_type', 'guest');
    setNickname(savedGuestName);
    setShowAuthModal(false);
  };

  const handleComingSoon = () => {
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 2000);
  };

  // Generate initials from nickname
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Generate consistent color from name
  const getAvatarColor = (name) => {
    if (!name) return 'bg-purple-600';
    const colors = [
      'bg-purple-600',
      'bg-blue-600',
      'bg-pink-600',
      'bg-indigo-600',
      'bg-violet-600',
      'bg-fuchsia-600',
      'bg-cyan-600',
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-violet-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      {/* Header */}
      <header className="py-8">
        <div className="max-w-md mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center text-2xl">
              🎲
            </div>
            <h1 className="text-2xl font-bold text-white">Gamenight</h1>
          </div>
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center justify-center"
            title="Profile"
          >
            {user?.displayName ? (
              <div className={`w-10 h-10 rounded-full ${getAvatarColor(user.displayName)} flex items-center justify-center text-white font-bold text-sm`}>
                {getInitials(user.displayName)}
              </div>
            ) : (
              <span className="material-symbols-outlined text-slate-400">person</span>
            )}
          </button>
        </div>
      </header>

      <div className="flex-1">
        <div className="max-w-md mx-auto px-6 py-10 h-full flex flex-col justify-between gap-8">
          
          {/* Nickname Modal (moved below header) */}

          {/* Host Game Card */}
          <button
            onClick={handleHostGame}
            className="relative w-full bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-8 overflow-hidden hover:shadow-xl hover:shadow-purple-900/50 active:scale-[0.98] transition-all"
          >
            {/* Decorative emojis */}
            <div className="absolute top-2 right-2 text-4xl opacity-20 rotate-12">🃏</div>
            <div className="absolute bottom-4 right-8 text-3xl opacity-15 -rotate-6">♟️</div>
            <div className="absolute top-8 right-12 text-2xl opacity-10">🎯</div>
            
            <div className="relative text-left space-y-2">
              <h2 className="text-2xl font-bold text-white">Host a Room</h2>
              <p className="text-purple-100 text-sm leading-relaxed">
                Create a live room and invite your friends to join.
              </p>
            </div>
          </button>

          <div className="flex items-center gap-3 text-slate-500 text-xs uppercase tracking-[0.3em]">
            <span className="h-px flex-1 bg-[#2a3f5f]"></span>
            <span>or</span>
            <span className="h-px flex-1 bg-[#2a3f5f]"></span>
          </div>

          <div className="space-y-3">
            <h3 className="text-white font-bold text-sm uppercase tracking-wide">Enter Invite Code</h3>
            <form onSubmit={handleJoinGame} className="space-y-3">
              {/* 6 Individual Character Boxes */}
              <div className="flex gap-2 justify-center">
                {codeDigits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(index, e)}
                    onPaste={index === 0 ? handleDigitPaste : undefined}
                    className="w-12 h-14 bg-[#16213e] border border-[#2a3f5f] rounded-lg text-white text-center text-xl font-bold uppercase outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                ))}
              </div>
              
              {/* Full-width Join Button */}
              <button
                type="submit"
                disabled={codeDigits.join('').length !== 6}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors disabled:cursor-not-allowed"
              >
                Join
              </button>
            </form>
          </div>

        </div>
      </div>

      {/* Host Game Dialog */}
      {showHostDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#16213e] border border-[#2a3f5f] rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white text-lg font-bold mb-4">Host a Game Night</h3>
            
            <div className="space-y-4 mb-6">
              {/* Host Game Name Input */}
              <div>
                <label className="block text-slate-400 text-xs font-medium mb-2">Your Name for This Game</label>
                <input
                  type="text"
                  value={hostGameName}
                  onChange={(e) => setHostGameName(e.target.value)}
                  placeholder={user?.displayName || 'Your game name'}
                  className="w-full bg-[#1a1a2e] border border-[#2a3f5f] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmHostGame();
                    if (e.key === 'Escape') setShowHostDialog(false);
                  }}
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowHostDialog(false);
                  setHostGameName('');
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHostGame}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 text-white rounded-lg font-bold transition-colors"
              >
                Host Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Game Rename Modal */}
      {showJoinRenameModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#16213e] border border-[#2a3f5f] rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white text-lg font-bold mb-2">Join Game Night</h3>
            <p className="text-slate-500 text-sm mb-4">Choose your name for this game</p>
            
            <input
              type="text"
              value={joinGameName}
              onChange={(e) => setJoinGameName(e.target.value)}
              placeholder="Your game name"
              className="w-full bg-[#1a1a2e] border border-[#2a3f5f] rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmJoin();
                if (e.key === 'Escape') {
                  setShowJoinRenameModal(false);
                  setPendingJoinRoomId(null);
                  setJoinGameName('');
                }
              }}
              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowJoinRenameModal(false);
                  setPendingJoinRoomId(null);
                  setJoinGameName('');
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmJoin}
                disabled={!joinGameName.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white rounded-lg font-bold transition-colors disabled:cursor-not-allowed"
              >
                Join Game
              </button>
            </div>
          </div>
        </div>
      )}

      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md bg-[#16213e] border border-[#2a3f5f] rounded-3xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-600 to-purple-700 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">
                🎲
              </div>
              <h1 className="text-3xl font-black text-white">Gamenight</h1>
              <p className="text-slate-400 mt-2">Gather. Play. Chaos.</p>
            </div>

            <div className="space-y-4">
              {savedGuestName && !showGuestInput && (
                <button
                  onClick={handleContinueAsGuest}
                  className="w-full text-slate-300 text-sm border border-[#2a3f5f] rounded-xl px-4 py-3 hover:border-slate-500 transition-colors"
                >
                  Continue as {savedGuestName}
                </button>
              )}

              <button
                onClick={() => setShowGuestInput((prev) => !prev)}
                className="w-full border border-[#2a3f5f] rounded-xl px-4 py-3 text-slate-300 hover:border-slate-500 transition-colors"
              >
                Join as Guest
              </button>

              {showGuestInput && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={guestNameInput}
                    onChange={(e) => setGuestNameInput(e.target.value)}
                    placeholder="Enter your display name"
                    maxLength={20}
                    className="w-full px-4 py-3 bg-[#1a1a2e] border border-[#2a3f5f] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleJoinAsGuest}
                    disabled={!guestNameInput.trim()}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 text-slate-500 text-xs uppercase tracking-[0.3em] my-6">
              <span className="h-px flex-1 bg-[#2a3f5f]"></span>
              <span>or</span>
              <span className="h-px flex-1 bg-[#2a3f5f]"></span>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleComingSoon}
                className="w-full bg-[#1a1a2e] border border-[#2a3f5f] rounded-xl px-4 py-4 flex items-center gap-3 text-white font-semibold hover:border-purple-500 transition-colors"
              >
                <div className="w-6 h-6 bg-white rounded flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <span>Continue with Google</span>
              </button>

              <button
                onClick={handleComingSoon}
                className="w-full bg-[#1a1a2e] border border-[#2a3f5f] rounded-xl px-4 py-4 flex items-center gap-3 text-white font-semibold hover:border-purple-500 transition-colors"
              >
                <div className="w-6 h-6 flex items-center justify-center text-white">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                </div>
                <span>Continue with Apple</span>
              </button>

              <button
                onClick={handleComingSoon}
                className="w-full bg-[#1a1a2e] border border-[#2a3f5f] rounded-xl px-4 py-4 flex items-center gap-3 text-white font-semibold hover:border-purple-500 transition-colors"
              >
                <div className="w-6 h-6 flex items-center justify-center text-slate-300">
                  <span className="material-symbols-outlined">mail</span>
                </div>
                <span>Continue with Email</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showComingSoon && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-white px-6 py-3 rounded-lg shadow-xl animate-fade-in z-50">
          <p className="text-sm font-medium">Coming soon! 🚀</p>
        </div>
      )}

    </div>
  );
}
