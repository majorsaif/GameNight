import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials } from '../utils/avatar';
import LOCATIONS from './locations';

export default function SpyfallGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading } = useRoom(roomId, user?.id, user?.displayName, user?.photo || null);

  const [gameState, setGameState] = useState(null);
  const [gameStateLoaded, setGameStateLoaded] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteError, setVoteError] = useState('');
  const [readyClicked, setReadyClicked] = useState(false);
  const [timerDisplay, setTimerDisplay] = useState(null);
  const timerRef = useRef(null);
  const timerExpiredRef = useRef(false);
  const QUESTIONING_INTRO_MS = 4000;

  // Subscribe to game state via onSnapshot
  useEffect(() => {
    if (!roomId) return;
    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.activeActivity && data.activeActivity.type === 'spyfall') {
          setGameState(data.activeActivity);
          setGameStateLoaded(true);
        } else {
          setGameState(null);
        }
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  // Reset vote/ready state on phase change
  useEffect(() => {
    if (gameState) {
      setHasVoted(gameState.votes?.[user?.id] != null || false);
      setSelectedPlayer(gameState.votes?.[user?.id] || null);
      setReadyClicked(gameState.readyVotes?.includes(user?.id) || false);
      setVoteError('');
    }
  }, [gameState?.phase]);

  // Hide card on new location-reveal phase
  useEffect(() => {
    if (gameState?.phase === 'location-reveal') {
      setShowCard(false);
    }
  }, [gameState?.phase]);

  // Questioning phase countdown timer
  useEffect(() => {
    if (gameState?.phase !== 'questioning') {
      setTimerDisplay(null);
      timerExpiredRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const startedAt = gameState.phaseStartedAt;
    const durationMs = (gameState.rules?.discussionTime || 8) * 60 * 1000;
    if (!startedAt) return;

    timerExpiredRef.current = false;

    const updateTimer = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, durationMs - elapsed);
      const secs = Math.ceil(remaining / 1000);
      setTimerDisplay(secs);

      if (remaining <= 0 && !timerExpiredRef.current) {
        timerExpiredRef.current = true;
        if (isHost) {
          handleStartVoting().catch(console.error);
        }
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState?.phase, gameState?.phaseStartedAt, isHost]);

  // Auto-advance to voting when all active players are ready
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'questioning') return;
    const activePlayers = getActivePlayers();
    if (activePlayers.length === 0) return;
    const readyVotes = gameState.readyVotes || [];
    const allReady = activePlayers.every((p) => readyVotes.includes(p.uid));
    if (allReady) {
      handleStartVoting().catch(console.error);
    }
  }, [isHost, gameState?.phase, gameState?.readyVotes]);

  // Host auto-transition from intro screen to questioning after a short delay
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'questioning-intro') return;

    const startedAt = gameState.phaseStartedAt;
    if (!startedAt) return;

    const elapsed = Date.now() - startedAt;
    const remainingMs = Math.max(0, QUESTIONING_INTRO_MS - elapsed);

    const timeoutId = setTimeout(() => {
      handleEnterQuestioningPhase().catch((err) => console.error('Error entering questioning phase:', err));
    }, remainingMs);

    return () => clearTimeout(timeoutId);
  }, [isHost, gameState?.phase, gameState?.phaseStartedAt]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getPlayerByUid = (uid) => gameState?.players?.find((p) => p.uid === uid);

  const getPlayerPhoto = (playerOrUid) => {
    const uid = typeof playerOrUid === 'string' ? playerOrUid : playerOrUid?.uid;
    if (!uid) return null;
    const activityPlayer = typeof playerOrUid === 'object' ? playerOrUid : getPlayerByUid(uid);
    const roomPlayer = room?.players?.find((p) => p.id === uid);
    return activityPlayer?.photo || activityPlayer?.photoURL || roomPlayer?.photo || null;
  };

  const renderAvatar = (player, sizeClass = 'w-10 h-10', textClass = 'text-sm', extra = '') => {
    const photo = getPlayerPhoto(player);
    if (photo) return <img src={photo} alt={player.displayName} className={`${sizeClass} rounded-full object-cover ${extra}`} />;
    return (
      <div className={`${sizeClass} ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold ${textClass} ${extra}`}>
        {getInitials(player.displayName)}
      </div>
    );
  };

  const isSpy = () => (gameState?.spyIds || []).includes(user?.id);

  const isActivePlayer = () => !(gameState?.eliminatedSpyIds || []).includes(user?.id);

  // Active spies (not yet eliminated)
  const getActiveSpies = () => {
    const eliminatedSpyIds = gameState?.eliminatedSpyIds || [];
    return (gameState?.spyIds || []).filter((uid) => !eliminatedSpyIds.includes(uid));
  };

  // All active (non-eliminated) players
  const getActivePlayers = () => {
    const eliminatedSpyIds = gameState?.eliminatedSpyIds || [];
    return (gameState?.players || []).filter((p) => !eliminatedSpyIds.includes(p.uid));
  };

  const formatTimer = (secs) => {
    if (secs == null) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const allLocations = LOCATIONS.map((l) => l.name);

  // ── Host Actions ──────────────────────────────────────────────────────────

  const handleStartQuestioning = async () => {
    if (!isHost) return;
    const activePlayers = getActivePlayers();
    if (activePlayers.length === 0) return;

    const firstAsker = activePlayers[Math.floor(Math.random() * activePlayers.length)];

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'questioning-intro',
      'activeActivity.phaseStartedAt': Date.now(),
      'activeActivity.currentAskerId': firstAsker.uid,
      'activeActivity.readyVotes': [],
      lastActivity: serverTimestamp(),
    });
  };

  const handleEnterQuestioningPhase = async () => {
    if (!isHost || !gameState || gameState.phase !== 'questioning-intro') return;

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'questioning',
      'activeActivity.phaseStartedAt': Date.now(),
      'activeActivity.readyVotes': [],
      lastActivity: serverTimestamp(),
    });
  };

  const handleStartVoting = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'voting',
      'activeActivity.votes': {},
      'activeActivity.eliminatedUid': null,
      'activeActivity.spyGuessing': null,
      lastActivity: serverTimestamp(),
    });
  };

  const handleEndVoting = async () => {
    if (!isHost || !gameState) return;
    const votes = gameState.votes || {};
    const activePlayers = getActivePlayers();

    const voteCounts = {};
    Object.values(votes).forEach((uid) => {
      voteCounts[uid] = (voteCounts[uid] || 0) + 1;
    });

    let maxVotes = 0;
    let candidates = [];
    Object.entries(voteCounts).forEach(([uid, count]) => {
      if (count > maxVotes) { maxVotes = count; candidates = [uid]; }
      else if (count === maxVotes) candidates.push(uid);
    });

    const eliminated = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : activePlayers[Math.floor(Math.random() * activePlayers.length)]?.uid;

    if (!eliminated) return;

    const spyIds = gameState.spyIds || [];
    const eliminatedSpyIds = gameState.eliminatedSpyIds || [];
    const isEliminatedSpy = spyIds.includes(eliminated);

    const roomRef = doc(db, 'rooms', roomId);

    if (!isEliminatedSpy) {
      // Non-spy voted out → spy wins
      await updateDoc(roomRef, {
        'activeActivity.eliminatedUid': eliminated,
        'activeActivity.phase': 'ended',
        'activeActivity.winner': 'spy',
        lastActivity: serverTimestamp(),
      });
      return;
    }

    const newEliminatedSpyIds = [...eliminatedSpyIds, eliminated];
    const remainingActiveSpies = spyIds.filter((uid) => !newEliminatedSpyIds.includes(uid));

    if (remainingActiveSpies.length === 0) {
      // Last spy eliminated → town wins
      await updateDoc(roomRef, {
        'activeActivity.eliminatedUid': eliminated,
        'activeActivity.eliminatedSpyIds': newEliminatedSpyIds,
        'activeActivity.phase': 'ended',
        'activeActivity.winner': 'town',
        lastActivity: serverTimestamp(),
      });
    } else {
      // More spies → continue questioning
      // Pick a new asker from remaining active players
      const remainingActivePlayers = activePlayers.filter((p) => p.uid !== eliminated);
      const newAsker = remainingActivePlayers[Math.floor(Math.random() * remainingActivePlayers.length)];
      await updateDoc(roomRef, {
        'activeActivity.eliminatedUid': eliminated,
        'activeActivity.eliminatedSpyIds': newEliminatedSpyIds,
        'activeActivity.phase': 'questioning',
        'activeActivity.phaseStartedAt': Date.now(),
        'activeActivity.readyVotes': [],
        'activeActivity.votes': {},
        'activeActivity.currentAskerId': newAsker?.uid || null,
        lastActivity: serverTimestamp(),
      });
    }
  };

  // Spy guess actions
  const handleReadyToGuess = async () => {
    if (!isSpy() || !user) return;
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.spyGuessing': { spyUid: user.id, status: 'guessing' },
      lastActivity: serverTimestamp(),
    });
  };

  const handleSpyGuessResult = async (correct) => {
    if (!isHost) return;
    const roomRef = doc(db, 'rooms', roomId);
    const spyUid = gameState.spyGuessing?.spyUid;
    const eliminatedSpyIds = gameState?.eliminatedSpyIds || [];
    const spyIds = gameState?.spyIds || [];

    if (correct) {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'ended',
        'activeActivity.winner': 'spy',
        'activeActivity.spyGuessing': null,
        lastActivity: serverTimestamp(),
      });
    } else {
      // Wrong guess — eliminate this spy
      const newEliminatedSpyIds = [...eliminatedSpyIds, spyUid];
      const remainingActiveSpies = spyIds.filter((uid) => !newEliminatedSpyIds.includes(uid));

      if (remainingActiveSpies.length === 0) {
        // Last spy guessed wrong → town wins
        await updateDoc(roomRef, {
          'activeActivity.eliminatedSpyIds': newEliminatedSpyIds,
          'activeActivity.phase': 'ended',
          'activeActivity.winner': 'town',
          'activeActivity.spyGuessing': null,
          lastActivity: serverTimestamp(),
        });
      } else {
        // Other spies remain — continue
        await updateDoc(roomRef, {
          'activeActivity.eliminatedSpyIds': newEliminatedSpyIds,
          'activeActivity.spyGuessing': null,
          lastActivity: serverTimestamp(),
        });
      }
    }
  };

  // Ready to vote
  const handleReadyToVote = async () => {
    if (!user || readyClicked) return;
    setReadyClicked(true);
    const roomRef = doc(db, 'rooms', roomId);
    const current = gameState.readyVotes || [];
    const updated = [...new Set([...current, user.id])];
    await updateDoc(roomRef, {
      'activeActivity.readyVotes': updated,
      lastActivity: serverTimestamp(),
    });
  };

  // Voting
  const handleVotePlayer = (uid) => {
    if (hasVoted) return;
    setSelectedPlayer(uid);
    setVoteError('');
  };

  const handleConfirmVote = async () => {
    if (!user || !selectedPlayer || hasVoted) return;
    if (selectedPlayer === user.id) { setVoteError('You cannot vote for yourself'); return; }
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      [`activeActivity.votes.${user.id}`]: selectedPlayer,
      lastActivity: serverTimestamp(),
    });
    setHasVoted(true);
  };

  const handlePlayAgain = async () => {
    if (!isHost) return;

    const players = [...(gameState.players || [])];
    const locationData = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const spyCount = gameState.rules?.spyCount || 1;
    const showRoles = gameState.rules?.showRoles !== false;

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const spyIds = shuffled.slice(0, spyCount).map((p) => p.uid);

    const playersWithRoles = players.map((player) => {
      if (spyIds.includes(player.uid)) return { ...player, role: null };
      const nonSpyIndex = players.filter((p) => !spyIds.includes(p.uid)).findIndex((p) => p.uid === player.uid);
      const role = showRoles ? locationData.roles[nonSpyIndex % locationData.roles.length] : null;
      return { ...player, role };
    });

    const roomRef = doc(db, 'rooms', roomId);

    await updateDoc(roomRef, {
      'activeActivity.phase': 'location-reveal',
      'activeActivity.location': locationData.name,
      'activeActivity.spyIds': spyIds,
      'activeActivity.eliminatedSpyIds': [],
      'activeActivity.players': playersWithRoles,
      'activeActivity.currentAskerId': null,
      'activeActivity.readyVotes': [],
      'activeActivity.votes': {},
      'activeActivity.eliminatedUid': null,
      'activeActivity.spyGuessing': null,
      'activeActivity.winner': null,
      'activeActivity.phaseStartedAt': null,
      'activeActivity.roundNumber': (gameState.roundNumber || 1) + 1,
      lastActivity: serverTimestamp(),
    });
  };

  const handleEndGame = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp(),
    });
    navigate(`/room/${roomId}`);
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (authLoading || roomLoading || !gameStateLoaded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⌛</div>
          <div className="text-white text-xl">Loading game...</div>
        </div>
      </div>
    );
  }

  if (!gameState) {
    navigate(`/room/${roomId}`);
    return null;
  }

  if (gameState.phase === 'lobby') {
    navigate(`/room/${roomId}`);
    return null;
  }

  const myPlayer = getPlayerByUid(user?.id);
  const amSpy = isSpy();
  const amActivePlayer = isActivePlayer();

  // ── LOCATION REVEAL PHASE ─────────────────────────────────────────────────

  if (gameState.phase === 'location-reveal') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center">
            {!showCard ? (
              <div>
                <div className="text-6xl mb-6">🃏</div>
                <h1 className="text-white text-2xl font-bold mb-4">Your card is face-down</h1>
                <p className="text-slate-400 mb-8">Tap Reveal to see your role in private</p>
                <button
                  onClick={() => setShowCard(true)}
                  className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-colors"
                >
                  Reveal 👁️
                </button>
              </div>
            ) : amSpy ? (
              <div>
                <div className="bg-gradient-to-br from-slate-800 to-slate-700 border-2 border-indigo-500/50 rounded-2xl p-8 text-center mb-6">
                  <div className="text-7xl mb-4">🕵️</div>
                  <h1 className="text-white text-3xl font-black mb-2">You are the SPY</h1>
                  <p className="text-slate-300 mt-3 text-sm">Try to figure out where everyone is!</p>
                </div>
                <button
                  onClick={() => setShowCard(false)}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  Hide Card
                </button>
              </div>
            ) : (
              <div>
                <div className="bg-gradient-to-br from-indigo-900 to-blue-800 border-2 border-indigo-500/50 rounded-2xl p-8 text-center mb-6">
                  <div className="text-7xl mb-4">📍</div>
                  <p className="text-indigo-200 text-sm mb-2 uppercase tracking-widest font-semibold">Location</p>
                  <h1 className="text-white text-4xl font-black mb-4">{gameState.location}</h1>
                  {gameState.rules?.showRoles && myPlayer?.role && (
                    <div className="bg-indigo-800/60 border border-indigo-600/40 rounded-xl p-3 mt-2">
                      <p className="text-indigo-200 text-xs mb-1">Your Role</p>
                      <p className="text-white text-xl font-bold">{myPlayer.role}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowCard(false)}
                  className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  Hide Card
                </button>
              </div>
            )}
          </div>

          <div className="mt-6">
            {isHost ? (
              <button
                onClick={handleStartQuestioning}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Start Questioning 🗣️
              </button>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
                <p className="text-slate-300">Waiting for host to start questioning...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTIONING INTRO PHASE ───────────────────────────────────────────────

  if (gameState.phase === 'questioning-intro') {
    const firstPlayer = getPlayerByUid(gameState.currentAskerId);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-indigo-900/50 border border-indigo-700 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4">🗣️</div>
            {firstPlayer ? (
              <>
                <div className="flex items-center justify-center mb-4">
                  {renderAvatar(firstPlayer, 'w-16 h-16', 'text-xl')}
                </div>
                <h2 className="text-white text-3xl font-black mb-2">{firstPlayer.displayName} goes first!</h2>
              </>
            ) : (
              <h2 className="text-white text-3xl font-black mb-2">A random player goes first!</h2>
            )}
            <p className="text-indigo-200 text-sm">Get ready to start questioning...</p>
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTIONING PHASE ─────────────────────────────────────────────────────

  if (gameState.phase === 'questioning') {
    const activePlayers = getActivePlayers();
    const spyGuessingData = gameState.spyGuessing;
    const guessingPlayer = spyGuessingData ? getPlayerByUid(spyGuessingData.spyUid) : null;
    const myReadyClicked = readyClicked || (gameState.readyVotes || []).includes(user?.id);
    const amActiveSpy = amSpy && amActivePlayer;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">

        {/* Timer bar */}
        <div className="w-full max-w-md mx-auto px-4 pt-4">
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-slate-400 text-sm font-semibold uppercase tracking-widest">Time Left</span>
            <span className={`text-2xl font-black tabular-nums ${timerDisplay != null && timerDisplay <= 30 ? 'text-red-400' : 'text-white'}`}>
              {timerDisplay != null ? formatTimer(timerDisplay) : '--:--'}
            </span>
          </div>
        </div>

        {/* Locations grid */}
        <div className="w-full max-w-md mx-auto px-4 pt-3 flex-1 overflow-y-auto">
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">All Locations</p>
          <div className="grid grid-cols-2 gap-1.5 pb-2">
            {allLocations.map((loc) => (
              <div
                key={loc}
                className={`rounded-lg px-3 py-2 text-sm text-center font-medium transition-colors ${
                  loc === gameState.location && !amSpy
                    ? 'bg-indigo-700 text-white border border-indigo-500'
                    : 'bg-slate-800/60 text-slate-300'
                }`}
              >
                {loc}
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="w-full max-w-md mx-auto px-4 py-4 space-y-2">
          {amActiveSpy && (
            <button
              onClick={handleReadyToGuess}
              disabled={!!spyGuessingData}
              className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 disabled:from-slate-700 disabled:to-slate-700 text-white disabled:text-slate-400 font-bold py-3 rounded-xl transition-colors"
            >
              Ready to Guess 🕵️
            </button>
          )}

          {amActivePlayer && (
            <button
              onClick={handleReadyToVote}
              disabled={myReadyClicked}
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 text-white disabled:text-slate-400 font-bold py-3 rounded-xl transition-colors"
            >
              {myReadyClicked ? "You're ready to vote ✅" : 'Ready to Vote ✋'}
            </button>
          )}

          {isHost && (
            <button
              onClick={handleStartVoting}
              className="w-full bg-white hover:bg-slate-200 text-slate-900 font-bold py-3 rounded-xl transition-colors"
            >
              Skip to Vote
            </button>
          )}

          {/* Ready count */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-center">
            <p className="text-slate-300 text-sm">
              Ready to vote: {(gameState.readyVotes || []).length}/{activePlayers.length} players ready
            </p>
          </div>
        </div>

        {/* Spy guessing overlay */}
        {spyGuessingData && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-yellow-600/50 rounded-2xl p-8 max-w-sm w-full text-center">
              <div className="text-6xl mb-4">🕵️</div>
              {guessingPlayer && (
                <div className="flex items-center justify-center mb-4">
                  {renderAvatar(guessingPlayer, 'w-14 h-14', 'text-lg')}
                </div>
              )}
              <h2 className="text-white text-2xl font-black mb-2">
                {guessingPlayer?.displayName || 'A spy'} is making a guess!
              </h2>
              <p className="text-slate-300 text-sm mb-6">They will say the location out loud.</p>

              {isHost ? (
                <div className="space-y-3">
                  <button
                    onClick={() => handleSpyGuessResult(true)}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition-colors"
                  >
                    Got it right ✅
                  </button>
                  <button
                    onClick={() => handleSpyGuessResult(false)}
                    className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-colors"
                  >
                    Got it wrong ❌
                  </button>
                </div>
              ) : (
                <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
                  <p className="text-slate-300">Waiting for host to confirm...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── VOTING PHASE ──────────────────────────────────────────────────────────

  if (gameState.phase === 'voting') {
    const votes = gameState.votes || {};
    const activePlayers = getActivePlayers();
    const totalVoters = activePlayers.length;
    const votedCount = Object.keys(votes).length;
    const allVoted = votedCount >= totalVoters;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">🗳️</div>
            <h1 className="text-white text-2xl font-black mb-2">Who is the Spy?</h1>
            <p className="text-slate-400 text-sm">Votes: {votedCount}/{totalVoters}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {activePlayers.map((player) => {
              const votersForPlayer = Object.entries(votes)
                .filter(([, t]) => t === player.uid)
                .map(([vUid]) => getPlayerByUid(vUid))
                .filter(Boolean);
              const isSelf = player.uid === user?.id;

              return (
                <button
                  key={player.uid}
                  onClick={() => !isSelf && handleVotePlayer(player.uid)}
                  disabled={hasVoted || isSelf}
                  className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                    isSelf ? 'opacity-40 cursor-not-allowed bg-slate-800/30' :
                    selectedPlayer === player.uid ? 'bg-indigo-600 ring-2 ring-white' :
                    'bg-slate-800/50 hover:bg-slate-700'
                  } ${hasVoted && !isSelf ? 'cursor-not-allowed' : ''}`}
                >
                  {renderAvatar(player, 'w-12 h-12', 'text-base')}
                  <div className="flex-1">
                    <span className="text-white font-semibold block">
                      {player.displayName} {isSelf ? '(You)' : ''}
                    </span>
                    <div className="flex items-center mt-2">
                      {votersForPlayer.map((voter, idx) => {
                        const vPhoto = getPlayerPhoto(voter);
                        return vPhoto ? (
                          <img key={voter.uid} src={vPhoto} alt={voter.displayName}
                            className={`w-6 h-6 rounded-full border-2 border-slate-900 object-cover ${idx > 0 ? '-ml-1.5' : ''}`}
                            title={voter.displayName} />
                        ) : (
                          <div key={voter.uid}
                            className={`w-6 h-6 ${voter.avatarColor} rounded-full border-2 border-slate-900 flex items-center justify-center text-[9px] text-white font-bold ${idx > 0 ? '-ml-1.5' : ''}`}
                            title={voter.displayName}>
                            {getInitials(voter.displayName)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {!hasVoted && (
            <button
              onClick={handleConfirmVote}
              disabled={!selectedPlayer}
              className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-slate-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
            >
              Confirm Vote
            </button>
          )}

          {voteError && <p className="text-red-400 text-sm text-center mt-2">{voteError}</p>}

          {hasVoted && !isHost && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center mt-3">
              <p className="text-indigo-400 font-semibold">Vote confirmed! ✅</p>
              <p className="text-slate-400 text-sm mt-1">Waiting for others...</p>
            </div>
          )}

          {isHost && (
            <button
              onClick={handleEndVoting}
              className="w-full mt-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-colors"
            >
              {allVoted ? 'End Voting' : `End Voting (${votedCount}/${totalVoters})`}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── ENDED PHASE ───────────────────────────────────────────────────────────

  if (gameState.phase === 'ended') {
    const winner = gameState.winner;
    const spyIds = gameState.spyIds || [];
    const spyPlayers = spyIds.map((uid) => getPlayerByUid(uid)).filter(Boolean);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="text-8xl mb-4">{winner === 'town' ? '🎉' : '🕵️'}</div>
            <h1 className="text-white text-4xl font-black mb-2">
              {winner === 'town' ? 'Town wins!' : 'Spy wins!'}
            </h1>
          </div>

          {/* Reveal location */}
          <div className="bg-indigo-900/50 border border-indigo-700 rounded-2xl p-6 text-center mb-4">
            <p className="text-indigo-200 text-sm mb-1 uppercase tracking-widest font-semibold">The Location Was</p>
            <h2 className="text-white text-3xl font-black">{gameState.location}</h2>
          </div>

          {/* Reveal spies */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-semibold mb-4">
              {spyPlayers.length === 1 ? 'The Spy was' : 'The Spies were'}
            </h3>
            <div className="space-y-3">
              {(gameState.players || []).map((player) => {
                const wasSpy = spyIds.includes(player.uid);
                return (
                  <div
                    key={player.uid}
                    className={`flex items-center justify-between rounded-lg p-3 ${wasSpy ? 'bg-amber-900/30' : 'bg-slate-700/50'}`}
                  >
                    <div className="flex items-center gap-3">
                      {renderAvatar(player, 'w-10 h-10', 'text-sm')}
                      <span className="text-white">{player.displayName}</span>
                    </div>
                    {wasSpy && (
                      <span className="text-sm font-bold uppercase text-amber-400">SPY 🕵️</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {isHost ? (
            <div className="space-y-3">
              <button
                onClick={handlePlayAgain}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Play Again 🔄
              </button>
              <button
                onClick={handleEndGame}
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-xl transition-colors"
              >
                End Game
              </button>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
              <p className="text-slate-300">Thanks for playing! 🎮</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
