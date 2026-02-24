import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createRoom, findRoomByCode } from '../hooks/useRoom';

export default function WelcomeScreen() {
  const [roomCode, setRoomCode] = useState('');
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const [nicknameInput, setNicknameInput] = useState('');
  const [showChangeNickname, setShowChangeNickname] = useState(false);
  const navigate = useNavigate();
  const { user, loading, hasNickname, setNickname, clearNickname } = useAuth();
  const inputRefs = useRef([]);

  const handleHostGame = () => {
    if (!user) return;
    
    // Create a new room in localStorage
    const room = createRoom(user.id, user.displayName);
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
        navigate(`/room/${room.id}`);
      } else {
        alert('Room not found. Please check the code and try again.');
      }
    }
  };

  const handleNicknameSubmit = (e) => {
    e.preventDefault();
    if (nicknameInput.trim()) {
      setNickname(nicknameInput);
      setNicknameInput('');
      setShowChangeNickname(false);
    }
  };

  const handleChangeNickname = () => {
    setShowChangeNickname(true);
    setNicknameInput(user?.displayName || '');
  };

  const handleCancelChange = () => {
    setShowChangeNickname(false);
    setNicknameInput('');
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

  // Show nickname prompt if no nickname is set or user wants to change it
  if (!hasNickname || showChangeNickname) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-slate-900/50 backdrop-blur-sm border-2 border-slate-700 rounded-3xl p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">👋</div>
              <h2 className="text-3xl font-black text-white mb-2">
                What should we call you?
              </h2>
              <p className="text-slate-400">
                Choose a nickname for this game night
              </p>
            </div>

            <form onSubmit={handleNicknameSubmit} className="space-y-6">
              <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder="Enter your nickname"
                maxLength={20}
                autoFocus
                className="w-full px-6 py-4 bg-slate-800 border-2 border-slate-700 hover:border-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 rounded-xl text-white placeholder-slate-500 text-center text-lg font-semibold outline-none transition-all"
              />
              
              <div className="flex gap-3">
                {showChangeNickname && (
                  <button
                    type="button"
                    onClick={handleCancelChange}
                    className="flex-1 px-6 py-4 bg-slate-800 hover:bg-slate-700 border-2 border-slate-600 text-slate-400 hover:text-slate-300 font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!nicknameInput.trim()}
                  className="flex-1 px-6 py-4 bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 hover:from-violet-500 hover:via-purple-500 hover:to-fuchsia-500 disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl shadow-lg shadow-purple-900/50 hover:shadow-xl hover:shadow-purple-800/60 hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:shadow-none transition-all duration-300 disabled:cursor-not-allowed"
                >
                  {showChangeNickname ? 'Update' : 'Continue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex flex-col">
      <div className="flex-1 overflow-y-auto pb-20">
        <div className="max-w-md mx-auto px-6 py-6 space-y-6">
          
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-purple-700 rounded-lg flex items-center justify-center text-2xl">
              🎲
            </div>
            <h1 className="text-2xl font-bold text-white">Gamenight</h1>
          </div>

          {/* Host Game Card */}
          <button
            onClick={handleHostGame}
            className="relative w-full bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-6 overflow-hidden hover:shadow-xl hover:shadow-purple-900/50 active:scale-[0.98] transition-all"
          >
            {/* Decorative emojis */}
            <div className="absolute top-2 right-2 text-4xl opacity-20 rotate-12">🃏</div>
            <div className="absolute bottom-4 right-8 text-3xl opacity-15 -rotate-6">♟️</div>
            <div className="absolute top-8 right-12 text-2xl opacity-10">🎯</div>
            
            <div className="relative text-left space-y-2">
              <h2 className="text-2xl font-bold text-white">Host Game</h2>
              <p className="text-purple-100 text-sm leading-relaxed">
                Create a new game lobby and invite your friends to join.
              </p>
            </div>
          </button>

          {/* Enter Invite Code Section */}
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
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors disabled:cursor-not-allowed"
              >
                Join
              </button>
            </form>
          </div>

          {/* Your Game Nights Section */}
          <div className="space-y-3">
            <h3 className="text-white font-bold text-sm uppercase tracking-wide">Your Game Nights</h3>
            
            {/* Mock game night cards - replace with actual data later */}
            <div className="space-y-2">
              {/* Example card 1 */}
              <div className="bg-[#16213e] border border-[#2a3f5f] rounded-xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-600/20 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                  🎮
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-bold text-sm truncate">Friday Night Games</h4>
                </div>
              </div>

              {/* Example card 2 */}
              <div className="bg-[#16213e] border border-[#2a3f5f] rounded-xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                  🎯
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-bold text-sm truncate">Weekend Tournament Night</h4>
                </div>
              </div>

              {/* Empty state when no games */}
              {/* Uncomment this and remove above cards when implementing real data
              <div className="bg-[#16213e] border border-[#2a3f5f] rounded-xl p-8 text-center">
                <p className="text-slate-500 text-sm italic">
                  No game nights yet.<br />
                  <span className="text-xs text-slate-600">Host or join a game to get started!</span>
                </p>
              </div>
              */}
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#16213e] border-t border-[#2a3f5f] px-6 py-4">
        <div className="max-w-md mx-auto flex justify-around items-center">
          <button className="flex flex-col items-center gap-1 text-slate-400">
            <div className="text-2xl">🏠</div>
            <span className="text-xs font-semibold">Home</span>
          </button>
          <button 
            onClick={handleChangeNickname}
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-400 transition-colors"
          >
            <div className="text-2xl">✉️</div>
            <span className="text-xs font-medium">Invites</span>
          </button>
          <button 
            onClick={handleChangeNickname}
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-slate-400 transition-colors"
          >
            <div className="text-2xl">👤</div>
            <span className="text-xs font-medium">Profile</span>
          </button>
        </div>
      </nav>

    </div>
  );
}
