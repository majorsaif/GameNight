import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Plus, Smartphone, WifiOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { createRoom, findRoomByCode, joinRoom } from '../hooks/useRoom';
import { GAME_LIST } from '../games/catalog';
import GameNightLogo from './GameNightLogo';
import ProfileModal from './ProfileModal';
import { useToast } from './Toast';
import { Avatar, Button, Card, LoadingScreen, Notice, Screen, cn } from '../ui';

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
      toast.error(error?.message || "Couldn't join that room. Try again.");
      setBusy(null);
    }
  };

  if (loading) return <LoadingScreen />;

  const codeComplete = codeDigits.join('').length === 6;

  return (
    <Screen
      width="wide"
      header={(
        <header className="pt-safe">
          <div className="mx-auto flex h-16 w-full max-w-column items-center justify-between px-safe md:max-w-wide">
            <GameNightLogo />
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              disabled={!user}
              className="inline-flex h-tap w-tap items-center justify-center rounded-full"
              aria-label="Open your profile"
              title="Your profile"
            >
              <Avatar player={user || undefined} name={user?.displayName || '?'} photo={user?.photo} />
            </button>
          </div>
        </header>
      )}
    >
      {authError && (
        <Notice tone="danger" icon={WifiOff} className="mt-2">
          Couldn&apos;t connect to the game server. Check your internet connection and reload the page.
        </Notice>
      )}

      <div className="grid flex-1 animate-enter content-start gap-section pt-4 md:grid-cols-2 md:content-center md:gap-x-16 md:pb-10">
        <section>
          <h1 className="text-3xl font-bold text-ink md:text-4xl">Party games for the whole room</h1>
          <p className="mt-3 text-base text-ink-muted md:text-lg">
            One person hosts and everyone joins on their own phone. No app to install, no sign-up.
          </p>
        </section>

        <section className="flex flex-col gap-4 md:col-start-2 md:row-span-2 md:row-start-1">
          <Button size="lg" block icon={Plus} onClick={handleHostGame} disabled={!user} loading={busy === 'host'}>
            {busy === 'host' ? 'Creating your room' : 'Host a room'}
          </Button>

          <Card as="form" onSubmit={handleJoinGame}>
            <h2 className="text-lg font-semibold text-ink">Join a room</h2>
            <p className="mt-1 text-sm text-ink-muted">Enter the 6-character code from the host.</p>
            <div className="mt-4 flex gap-2">
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
                  aria-label={`Room code character ${index + 1} of 6`}
                  maxLength={6}
                  value={digit}
                  onChange={(e) => handleDigitChange(index, e.target.value.slice(-6))}
                  onKeyDown={(e) => handleDigitKeyDown(index, e)}
                  onPaste={(e) => handleDigitPaste(index, e)}
                  onFocus={(e) => e.target.select()}
                  className={cn(
                    'h-14 w-full min-w-0 flex-1 rounded-control border bg-surface-sunken px-0 text-center text-xl font-bold uppercase text-ink transition-colors duration-150',
                    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus-visible:outline-none',
                    digit ? 'border-line-strong' : 'border-line'
                  )}
                />
              ))}
            </div>
            <Button type="submit" block className="mt-4" disabled={!codeComplete || !user} loading={busy === 'join'}>
              {busy === 'join' ? 'Joining' : 'Join room'}
            </Button>
          </Card>

          <Link
            to="/one-phone"
            className="flex min-h-16 items-center gap-4 rounded-card border border-line bg-surface p-4 transition-colors duration-150 hover:border-line-strong"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300">
              <Smartphone className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-ink">Pass &amp; Play</span>
              <span className="block text-sm text-ink-muted">Only one phone? Pass it around the group.</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden="true" />
          </Link>
        </section>

        <section className="md:col-start-1 md:row-start-2" aria-label="Games included">
          <ul className="grid grid-cols-3 gap-3">
            {GAME_LIST.map((game) => (
              <li key={game.type} className="min-w-0">
                <div className="overflow-hidden rounded-control border border-line bg-surface">
                  <img src={game.art} alt="" loading="lazy" className="aspect-[16/10] w-full scale-110 object-cover" />
                </div>
                <p className="mt-2 truncate text-sm font-semibold text-ink">{game.name}</p>
                <p className="text-xs text-ink-faint">{game.minPlayers}+ players</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="pt-4 text-center">
        <Link to="/privacy" className="inline-flex min-h-tap items-center rounded-sm px-2 text-sm text-ink-faint underline-offset-4 hover:text-ink hover:underline">
          Privacy
        </Link>
      </footer>

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </Screen>
  );
}
