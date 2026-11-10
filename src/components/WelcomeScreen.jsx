import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { createRoom, findRoomByCode, joinRoom } from '../hooks/useRoom';
import { colorForUid, getInitials } from '../utils/avatar';
import GameNightLogo from './GameNightLogo';
import ProfileModal from './ProfileModal';
import { useToast } from './Toast';

const EMPTY_CODE = ['', '', '', '', '', ''];

export default function WelcomeScreen() {
  const [codeDigits, setCodeDigits] = useState(EMPTY_CODE);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [busy, setBusy] = useState(null); // 'host' | 'join' | null
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading, authError } = useAuth();
  const inputRefs = useRef([]);

  useEffect(() => {
    document.title = 'Its Games Night - party games for your group';
  }, []);

  useEffect(() => {
    if (!loading && !user && !authError) {
      navigate('/onboarding', { replace: true });
    }
  }, [loading, user, authError, navigate]);

  const handleHostGame = async () => {
    if (!user || busy) return;
    setBusy('host');
    try {
      const room = await createRoom(user);
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      toast.error(error?.message?.includes('signing') ? error.message : "Couldn't create a room. Check your connection and try again.");
      setBusy(null);
    }
  };

  const setCodeFrom = (text, startIndex = 0) => {
    const chars = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
    if (chars.length === 0) return;
    const next = [...codeDigits];
    let index = startIndex;
    chars.forEach((char) => {
      if (index < 6) {
        next[index] = char;
        index += 1;
      }
    });
    setCodeDigits(next);
    inputRefs.current[Math.min(index, 5)]?.focus();
  };

  const handleDigitChange = (index, value) => {
    if (!value) return;
    setCodeFrom(value, index);
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const next = [...codeDigits];
      if (codeDigits[index] === '' && index > 0) {
        next[index - 1] = '';
        inputRefs.current[index - 1]?.focus();
      } else {
        next[index] = '';
      }
      setCodeDigits(next);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitPaste = (index, e) => {
    e.preventDefault();
    setCodeFrom(e.clipboardData.getData('text'), index);
  };

  const handleJoinGame = async (e) => {
    e.preventDefault();
    if (!user || busy) return;
    const code = codeDigits.join('');
    if (code.length !== 6) return;

    setBusy('join');
    try {
      const room = await findRoomByCode(code);
      if (!room) {
        toast.error(`No active room with code ${code}. Check the code and try again.`);
        setBusy(null);
        return;
      }
      await joinRoom(room.id, user);
      setCodeDigits(EMPTY_CODE);
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error('Join failed:', error);
      toast.error(error?.message || "Couldn't join that room. Please try again.");
      setBusy(null);
    }
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
      {authError && (
        <div className="bg-red-900/60 border-b border-red-700 text-red-100 text-sm text-center px-4 py-3">
          Couldn&apos;t connect to the game server. Check your internet connection and reload the page.
        </div>
      )}
      {/* Header */}
      <header className="py-8">
        <div className="max-w-md mx-auto px-6 flex justify-end items-center">
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center justify-center"
            title="Profile"
            aria-label="Open profile"
          >
            {user?.photo ? (
              <img
                src={user.photo}
                alt={user.displayName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : user?.displayName ? (
              <div className={`w-10 h-10 rounded-full ${colorForUid(user.id)} flex items-center justify-center text-white font-bold text-sm`}>
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
            disabled={!user || Boolean(busy)}
            aria-busy={busy === 'host'}
            className="relative w-full disabled:opacity-70 disabled:cursor-wait bg-gradient-to-br from-purple-600 via-purple-700 to-purple-800 rounded-2xl p-8 overflow-hidden hover:shadow-xl hover:shadow-purple-900/50 active:scale-[0.98] transition-all"
          >
            {/* Decorative emojis */}
            <div className="absolute top-2 right-2 text-4xl opacity-20 rotate-12">🃏</div>
            <div className="absolute bottom-4 right-8 text-3xl opacity-15 -rotate-6">♟️</div>
            <div className="absolute top-8 right-12 text-2xl opacity-10">🎯</div>
            
            <div className="relative text-left space-y-2">
              <h2 className="text-2xl font-bold text-white">{busy === 'host' ? 'Creating room...' : 'Host a Room'}</h2>
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
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label={`Room code character ${index + 1}`}
                    maxLength={6}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value.slice(-6))}
                    onKeyDown={(e) => handleDigitKeyDown(index, e)}
                    onPaste={(e) => handleDigitPaste(index, e)}
                    onFocus={(e) => e.target.select()}
                    className="w-12 h-14 bg-[#16213e] border border-[#2a3f5f] rounded-lg text-white text-center text-xl font-bold uppercase outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                ))}
              </div>
              
              {/* Full-width Join Button */}
              <button
                type="submit"
                disabled={codeDigits.join('').length !== 6 || Boolean(busy)}
                className="w-full py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-colors disabled:cursor-not-allowed"
              >
                {busy === 'join' ? 'Joining...' : 'Join'}
              </button>
            </form>
          </div>

        </div>
      </div>

      <footer className="py-6 text-center text-xs text-slate-600">
        <Link to="/privacy" className="hover:text-slate-400">Privacy</Link>
        <span className="mx-2">·</span>
        <span>Mafia · Word Imposter · Spyfall · Spin the Wheel</span>
      </footer>

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </div>
  );
}
