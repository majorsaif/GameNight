import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createRoom, findRoomByCode, joinRoom } from '../hooks/useRoom';
import GameNightLogo from './GameNightLogo';

export default function WelcomeScreen() {
  const [codeDigits, setCodeDigits] = useState(['', '', '', '', '', '']);
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const inputRefs = useRef([]);

  useEffect(() => {
    // If no nickname is set, redirect to onboarding
    if (!loading && !user) {
      navigate('/onboarding');
    }
  }, [loading, user, navigate]);

  const handleHostGame = async () => {
    if (!user) return;
    try {
      console.log('📍 Starting room creation with user:', { userId: user.id, displayName: user.displayName });
      const room = await createRoom(user.id, user.displayName, user.photo);
      console.log('✅ Room created, navigating to:', `/room/${room.id}`);
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error('❌ Error in handleHostGame:', error);
      alert('Failed to create room. Please try again.');
    }
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

  const handleJoinGame = async (e) => {
    e.preventDefault();
    
    // Validate user auth is ready
    if (!user) {
      console.error('❌ handleJoinGame: User not authenticated');
      alert('Please wait for authentication to complete or set a nickname first.');
      return;
    }
    
    if (!user.id) {
      console.error('❌ handleJoinGame: User missing ID, auth still initializing');
      alert('Authentication is still initializing. Please try again.');
      return;
    }
    
    const code = codeDigits.join('');
    if (code.length !== 6) {
      console.warn('⚠️ handleJoinGame: Code incomplete or invalid');
      return;
    }
    
    try {
      console.log('📍 handleJoinGame: Starting join flow with code:', code, '| User:', { userId: user.id, displayName: user.displayName });
      
      // Find room by code
      const room = await findRoomByCode(code);
      if (!room) {
        console.warn('❌ handleJoinGame: Room not found for code:', code);
        alert('Room not found. Please check the code and try again.');
        return;
      }
      
      console.log('✅ handleJoinGame: Room found, now joining:', { roomId: room.id, code: code });
      
      // Join the room
      await joinRoom(room.id, user.id, user.displayName, user.photo);
      console.log('✅ handleJoinGame: Successfully joined room, navigating to:', `/room/${room.id}`);
      
      setCodeDigits(['', '', '', '', '', '']);
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error('❌ handleJoinGame: Join failed:', error.message, error);
      alert(`Failed to join room: ${error.message}. Please try again.`);
    }
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Header */}
      <header className="py-8">
        <div className="max-w-md mx-auto px-6 flex justify-end items-center">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center justify-center"
            title="Profile"
          >
            {user?.photo ? (
              <img
                src={user.photo}
                alt={user.displayName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : user?.displayName ? (
              <div className={`w-10 h-10 rounded-full ${getAvatarColor(user.displayName)} flex items-center justify-center text-white font-bold text-sm`}>
                {getInitials(user.displayName)}
              </div>
            ) : (
              <span className="material-symbols-outlined text-slate-400">person</span>
            )}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <div className="text-center pt-2 pb-4 flex justify-center">
        <GameNightLogo size="hero" />
      </div>

      <div className="flex-1">
        <div className="max-w-md mx-auto px-6 py-10 h-full flex flex-col justify-between gap-8">
          
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
    </div>
  );
}
