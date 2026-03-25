import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials } from '../utils/avatar';
import LOCATIONS from './locations';
import VotingPanel from '../components/VotingPanel';
import gameNightIcon from '../assets/itsgamesnight-icon.png';

export default function SpyfallGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading } = useRoom(roomId, user?.id, user?.displayName, user?.photo || null);

  const [gameState, setGameState] = useState(null);
  const [gameStateLoaded, setGameStateLoaded] = useState(false);
  const [showCard, setShowCard] = useState(false);
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
      setReadyClicked(gameState.readyVotes?.includes(user?.id) || false);
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
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState?.phase, gameState?.phaseStartedAt, gameState?.rules?.discussionTime, isHost]);

  // Auto-advance to voting when all active players are ready
  useEffect(() => {
    if (!isHost || gameState?.phase !== 'questioning-intro' || !gameState?.phaseStartedAt) return;

    const readyVotes = gameState.readyVotes || [];
    const allPlayerUids = getActivePlayers().map((player) => player.uid);

    if (allPlayerUids.length > 0 && allPlayerUids.every((uid) => readyVotes.includes(uid))) {
      handleStartVoting().catch(console.error);
      return;
    }

    const elapsed = Date.now() - gameState.phaseStartedAt;
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
      'activeActivity.declaringGuess': null,
      'activeActivity.pausedFromPhase': null,
      lastActivity: serverTimestamp(),
    });
  };

  const handleEndVoting = async () => {
    if (!isHost || !gameState) return;
    if (isGuessPaused) return;
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
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
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
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
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
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
        lastActivity: serverTimestamp(),
      });
    }
  };

  // Spy guess actions
  const handleDeclareGuess = async () => {
    if (!user || !gameState) return;
    if (gameState.phase !== 'voting') return;
    if (!amSpy || !amActivePlayer || isGuessPaused) return;

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.declaringGuess': {
        uid: user.id,
        displayName: user.displayName || getPlayerByUid(user.id)?.displayName || 'Unknown'
      },
      'activeActivity.pausedFromPhase': gameState.phase,
      lastActivity: serverTimestamp(),
    });
  };

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

    if (correct) {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'ended',
        'activeActivity.winner': 'spy',
        'activeActivity.spyGuessing': null,
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
        lastActivity: serverTimestamp(),
      });
    } else {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'ended',
        'activeActivity.winner': 'town',
        'activeActivity.spyGuessing': null,
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
        lastActivity: serverTimestamp(),
      });
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
  const handleConfirmVote = async (targetUid) => {
    if (!user || !targetUid) {
      throw new Error('Vote unavailable');
    }
    if (isGuessPaused) {
      throw new Error('Voting is paused');
    }
    if (targetUid === user.id) {
      throw new Error('You cannot vote for yourself');
    }

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      [`activeActivity.votes.${user.id}`]: targetUid,
      lastActivity: serverTimestamp(),
    });
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
      'activeActivity.declaringGuess': null,
      'activeActivity.pausedFromPhase': null,
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
      <div className="spyfall-game font-sans min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
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
  const declaringGuess = gameState?.declaringGuess || null;
  const isGuessPaused = Boolean(declaringGuess);

  const renderSpyGuessOverlay = (overlayPlayer, fallbackName = 'A spy') => (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-4">
      <div className="bg-[#1e2a3a] border-2 border-[#c9882a]/60 rounded-2xl p-6 max-w-sm w-full mx-auto overflow-hidden">
        <p className="spy-mono uppercase text-[#c9882a] tracking-widest text-xs text-center mb-4">SPY DECLARATION IN PROGRESS</p>
        <div className="border-t border-[#2e3f52] mb-4" />

        {overlayPlayer && (
          <div className="flex items-center justify-center mb-2">
            {renderAvatar(overlayPlayer, 'w-14 h-14', 'text-lg')}
          </div>
        )}

        <h2 className="spy-serif text-2xl font-bold text-white text-center mt-2">
          {overlayPlayer?.displayName || fallbackName}
        </h2>
        <p className="spy-mono text-[#7a8c9e] text-xs tracking-wide text-center mt-1">
          {(overlayPlayer?.displayName || fallbackName)} is declaring their location guess.
        </p>
        <p className="text-white/80 text-sm text-center mt-3">They will say the location out loud.</p>

        {isHost ? (
          <>
            <button
              onClick={() => handleSpyGuessResult(true)}
              className="spy-mono bg-[#1a5c2a] hover:bg-[#156622] text-white w-full uppercase rounded-xl py-3 font-bold mt-4 transition-colors"
            >
              Correct
            </button>
            <button
              onClick={() => handleSpyGuessResult(false)}
              className="spy-mono bg-[#6b1515] hover:bg-[#8b1a1a] text-white w-full uppercase rounded-xl py-3 font-bold mt-2 transition-colors"
            >
              Incorrect
            </button>
            <p className="spy-mono text-[#7a8c9e]/60 text-xs text-center mt-2">Host only - confirm what the spy said out loud</p>
          </>
        ) : (
          <div className="bg-[#2e3f52] rounded-xl px-4 py-3 mt-4">
            <p className="spy-mono italic text-[#7a8c9e] text-sm text-center">Awaiting host confirmation...</p>
          </div>
        )}
      </div>
    </div>
  );

  // ── LOCATION REVEAL PHASE ─────────────────────────────────────────────────

  if (gameState.phase === 'location-reveal') {
    const passengerName = myPlayer?.displayName || user?.displayName || 'Passenger';
    const locationName = gameState.location || 'UNKNOWN';
    const locationSizeClass = locationName.length > 10 ? 'text-2xl' : 'text-4xl';
    const isSealed = !showCard;

    return (
      <div className="spyfall-game font-sans min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="w-full max-w-sm min-h-[420px] mx-auto">
            <div className={`relative rounded-2xl overflow-hidden border max-w-sm w-full mx-auto min-h-[420px] flex flex-col ${isSealed ? 'bg-[#1c2b20] border-[#3a4f3e]' : 'bg-white border-[#c9882a]/40'}`}>
              <div className={`h-[320px] overflow-hidden px-5 pt-4 pb-5 flex flex-col gap-3 ${isSealed ? 'bg-[#2d3d2a]' : 'bg-[#ece9e1]'}`}>
                <div className={`-mx-5 -mt-4 px-5 py-2 mb-4 flex items-center justify-between ${isSealed ? 'bg-[#b57a2f] border-b border-[#c9882a]/70' : 'bg-[#c9882a]'}`}>
                  <span className="spy-mono uppercase font-bold text-xs tracking-widest text-white">BOARDING PASS</span>
                  <span className="text-white text-sm">✈︎</span>
                </div>

                <div className="text-center py-2 h-[96px] flex flex-col items-center justify-center">
                  <p className={`spy-mono uppercase text-[10px] tracking-widest mb-1 ${isSealed ? 'text-[#4a6650]' : 'text-[#7a8c9e]'}`}>DESTINATION</p>
                  <div className="h-12 flex items-center justify-center">
                    {isSealed ? (
                      <span className="bg-[#d4c9a8] h-10 w-48 mx-auto rounded inline-block" />
                    ) : amSpy ? (
                      <p className={`spy-mono font-black ${locationSizeClass} text-[#cc3333] truncate`}>UNKNOWN</p>
                    ) : (
                      <p className={`spy-mono font-black ${locationSizeClass} text-[#2c1810] truncate`}>{locationName}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-5 -mx-5">
                  <div>
                    <p className={`spy-mono uppercase text-[10px] tracking-widest ${isSealed ? 'text-[#4a6650]' : 'text-[#7a8c9e]'}`}>PASSENGER</p>
                    <div className="h-8 mt-1 flex items-center">
                      {isSealed ? (
                        <span className="rounded h-3 w-20 inline-block bg-[#d4c9a8]" />
                      ) : (
                        <p className="spy-mono font-bold text-lg text-[#2c1810] truncate">{passengerName}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className={`spy-mono uppercase text-[10px] tracking-widest ${isSealed ? 'text-[#4a6650]' : 'text-[#7a8c9e]'}`}>ROLE</p>
                    <div className="h-8 mt-1 flex items-center">
                      {isSealed ? (
                        <span className="bg-[#d4c9a8] rounded h-3 w-20 inline-block" />
                      ) : (
                        <p className="spy-mono font-bold text-lg text-[#2c1810] truncate">{myPlayer?.role || (amSpy ? 'SPY' : 'OPERATIVE')}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`relative border-t-2 border-dashed ${isSealed ? 'border-[#3a4f3e]' : 'border-[#d4c9a8]'}`}>
                <span className="w-6 h-6 rounded-full bg-[#0d1117] absolute -left-3 top-1/2 -translate-y-1/2" />
                <span className="w-6 h-6 rounded-full bg-[#0d1117] absolute -right-3 top-1/2 -translate-y-1/2" />
              </div>

              <div className={`min-h-20 flex-1 px-5 py-3 flex items-center justify-between ${isSealed ? 'bg-[#d4c9a8]' : 'bg-[#e6e2d9]'}`}>
                <div className="flex flex-col gap-1 text-left">
                  <div className="flex gap-[2px]">
                    {Array.from({ length: 24 }).map((_, index) => (
                      <div
                        key={`stub-barcode-${index}`}
                        className={`${index % 2 === 0 ? 'w-[2px]' : 'w-[1px]'} h-8 rounded-sm ${isSealed ? 'bg-[#4a6650]' : 'bg-[#2c1810]'}`}
                      />
                    ))}
                  </div>
                  <p className={`spy-mono uppercase text-[9px] tracking-widest ${isSealed ? 'text-[#4a6650]' : 'text-[#2c1810]'}`}>ITS GAMES NIGHT</p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <img
                    src={gameNightIcon}
                    alt="Its Games Night icon"
                    className="w-10 h-10 rounded-lg object-cover"
                    style={{ filter: isSealed ? 'grayscale(1) contrast(2.2) brightness(0.22) opacity(0.95)' : 'grayscale(1) contrast(1.8) brightness(0.45) opacity(0.9)' }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 w-full mt-4">
              <button
                onClick={() => setShowCard((prev) => !prev)}
                className={`spy-mono w-full rounded-xl py-4 font-bold uppercase tracking-widest text-base transition-colors ${
                  showCard
                    ? 'bg-[#2e3f52] hover:bg-[#3a4f68] text-white'
                    : 'bg-[#c9882a] hover:bg-[#b07520] text-white'
                }`}
              >
                {showCard ? 'Hide Pass' : 'Reveal Pass'}
              </button>

              {isHost ? (
                <button
                  onClick={handleStartQuestioning}
                  className="spy-mono w-full rounded-xl py-4 font-bold uppercase tracking-widest text-base bg-violet-600 hover:bg-violet-700 text-white transition-colors"
                >
                  Start Questioning
                </button>
              ) : (
                <div className="bg-[#1e2a3a] border border-[#2e3f52] rounded-xl p-4 text-center">
                  <p className="spy-mono italic text-[#7a8c9e]">Waiting for host to start questioning...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── QUESTIONING INTRO PHASE ───────────────────────────────────────────────

  if (gameState.phase === 'questioning-intro') {
    const firstPlayer = getPlayerByUid(gameState.currentAskerId);

    return (
      <div className="spyfall-game font-sans min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-[#1e2a3a] border border-[#2e3f52] rounded-2xl p-8 text-center">
            <p className="uppercase tracking-widest text-xs text-[#c9882a] text-center" style={{ fontFamily: "'Courier Prime', monospace" }}>NOW BOARDING - QUESTIONING BEGINS</p>
            <div className="border-t border-[#2e3f52] mx-4 my-3" />
            <p className="uppercase tracking-widest text-xs text-[#7a8c9e] text-center" style={{ fontFamily: "'Courier Prime', monospace" }}>FIRST TO QUESTION</p>
            {firstPlayer ? (
              <>
                <div className="flex items-center justify-center gap-3 my-3">
                  {renderAvatar(firstPlayer, 'w-16 h-16', 'text-xl')}
                  <h2 className="text-2xl font-bold text-white" style={{ fontFamily: "'Playfair Display', serif" }}>{firstPlayer.displayName}</h2>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white my-3" style={{ fontFamily: "'Playfair Display', serif" }}>A random player</h2>
              </>
            )}
            <div className="border-t border-[#2e3f52] mx-4 my-3" />
            <p className="spy-mono text-[#c9882a] text-xs tracking-wide mt-2">Prepare to identify the spy</p>
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
      <div className="spyfall-game font-sans min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">

        {/* Timer bar */}
        <div className="w-full max-w-md mx-auto px-4 pt-4">
          <div className="bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#2e3f52]">
            <div className="bg-[#1a1a1a] px-4 py-2 flex items-center justify-start">
              <span className="font-mono uppercase text-white font-bold text-sm tracking-widest">FLIGHTS</span>
            </div>
            <div className="bg-[#111] px-4 py-4 flex items-center justify-between w-full">
              {/* REMAINING label - character boxes */}
              <div className="flex items-center gap-1">
                {'TIME'.split('').map((char, idx) => (
                  <div
                    key={`label-${idx}`}
                    className="inline-flex items-center justify-center bg-[#1a1a1a] border border-[#333] w-6 h-7 rounded-sm relative"
                    style={{
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(0,0,0,0.3)'
                    }}
                  >
                    <span className="font-bold text-sm text-[#e8e0c8]" style={{fontFamily: "OCR-A, 'Courier New', monospace"}}>{char}</span>
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-[#000]/40 pointer-events-none"></div>
                  </div>
                ))}
              </div>
              {/* Timer - character boxes */}
              <div className="flex items-center gap-1">
                {(timerDisplay != null ? formatTimer(timerDisplay) : '--:--').split('').map((char, idx) => (
                  <div
                    key={`timer-${idx}`}
                    className="inline-flex items-center justify-center bg-[#111] border border-[#2a2a2a] w-6 h-7 rounded-sm relative"
                    style={{
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), inset 0 -2px 4px rgba(0,0,0,0.3)'
                    }}
                  >
                    <span className="font-bold text-[#f5c842] text-sm" style={{fontFamily: "OCR-A, 'Courier New', monospace"}}>
                      {char}
                    </span>
                    <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-[#000]/40 pointer-events-none"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Locations grid */}
        <div className="w-full max-w-md mx-auto px-4 pt-3 flex-1 overflow-y-auto">
          <p className="spy-mono uppercase tracking-widest text-xs text-[#7a8c9e] mb-3">ALL LOCATIONS</p>
          <div className="grid grid-cols-2 gap-1.5 pb-2">
            {allLocations.map((loc) => (
              <button
                type="button"
                key={loc}
                className={`rounded-lg px-3 py-2 text-sm text-center font-medium transition-colors ${
                  loc === gameState.location && !amSpy
                    ? 'bg-[#c9882a]/15 border border-[#c9882a] text-[#c9882a] font-bold'
                    : 'bg-[#1e2a3a] border border-[#2e3f52] text-[#d4c9a8]'
                }`}
              >
                {loc === gameState.location && !amSpy ? '📍 ' : ''}{loc}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="w-full max-w-md mx-auto px-4 py-4 space-y-2">
          {amActivePlayer && (
            <button
              onClick={handleReadyToVote}
              disabled={myReadyClicked}
              className="spy-mono w-full bg-violet-600 hover:bg-violet-700 disabled:bg-[#2e3f52] text-white disabled:text-[#7a8c9e] uppercase tracking-widest font-bold py-4 rounded-xl transition-colors"
            >
              {myReadyClicked ? 'Ready to Vote' : 'Ready to Vote'}
            </button>
          )}

          {/* Ready count */}
          <div className="bg-[#1e2a3a] border border-[#2e3f52] rounded-xl p-4 text-center">
            <p className="spy-mono text-[#7a8c9e] text-sm">
              Ready: {(gameState.readyVotes || []).length}/{activePlayers.length}
            </p>
            <div className="flex items-center justify-center mt-3">
              {activePlayers.map((player, index) => {
                const isReady = (gameState.readyVotes || []).includes(player.uid);
                const playerPhoto = getPlayerPhoto(player);
                return (
                  playerPhoto ? (
                    <img
                      key={player.uid}
                      src={playerPhoto}
                      alt={player.displayName}
                      className={`w-7 h-7 rounded-full border-2 border-slate-900 object-cover ${index > 0 ? '-ml-2' : ''} ${isReady ? '' : 'opacity-50 grayscale'}`}
                      title={`${player.displayName}${isReady ? ' (Ready)' : ' (Not ready)'}`}
                    />
                  ) : (
                    <div
                      key={player.uid}
                      className={`w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold ${index > 0 ? '-ml-2' : ''} ${
                        isReady ? `${player.avatarColor} text-white` : 'bg-slate-700 text-slate-400'
                      }`}
                      title={`${player.displayName}${isReady ? ' (Ready)' : ' (Not ready)'}`}
                    >
                      {getInitials(player.displayName)}
                    </div>
                  )
                );
              })}
            </div>
          </div>

          {isHost && (
            <button
              onClick={handleStartVoting}
              className="spy-mono w-full bg-white hover:bg-slate-200 text-[#0d1117] font-bold uppercase tracking-widest py-4 rounded-xl transition-colors"
            >
              START VOTING
            </button>
          )}

          {amActiveSpy && (
            <button
              onClick={handleReadyToGuess}
              disabled={!!spyGuessingData}
              className="spy-mono w-full bg-[#6b1515] hover:bg-[#8b1a1a] disabled:bg-[#2e3f52] text-white disabled:text-[#7a8c9e] uppercase tracking-widest font-bold py-4 rounded-xl transition-colors"
            >
              Ready to Guess
            </button>
          )}
        </div>

        {/* Spy guessing overlay */}
        {spyGuessingData && renderSpyGuessOverlay(guessingPlayer)}
      </div>
    );
  }

  // ── VOTING PHASE ──────────────────────────────────────────────────────────

  if (gameState.phase === 'voting') {
    const votes = gameState.votes || {};
    const activePlayers = getActivePlayers();
    const totalVoters = activePlayers.length;
    const votedCount = Object.keys(votes).length;
    const canDeclareGuess = Boolean(amSpy && amActivePlayer && !isGuessPaused);
    const votingGuessingPlayer = declaringGuess ? getPlayerByUid(declaringGuess.uid) : null;

    return (
      <div className="spyfall-game font-sans min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-white text-2xl font-bold mb-2" style={{fontFamily: "OCR-A, 'Courier New', monospace"}}>Who is the Spy?</h1>
            <p className="spy-mono text-[#7a8c9e] text-xs uppercase tracking-widest">Votes: {votedCount}/{totalVoters}</p>
          </div>

          <div style={isGuessPaused ? { pointerEvents: 'none', opacity: 0.55 } : undefined}>
            <VotingPanel
              players={activePlayers}
              votes={votes}
              currentUid={user?.id}
              isHost={isHost}
              onVote={handleConfirmVote}
              onEndVoting={handleEndVoting}
              theme="ballot"
            />
          </div>

          {amActivePlayer && amSpy && (
            <button
              onClick={handleDeclareGuess}
              disabled={!canDeclareGuess}
              className="spy-mono w-full mt-3 bg-[#6b1515] hover:bg-[#8b1a1a] disabled:bg-[#2e3f52] text-white disabled:text-[#7a8c9e] uppercase tracking-widest font-bold py-4 rounded-xl transition-colors"
            >
              Declare Guess
            </button>
          )}
        </div>

        {declaringGuess && renderSpyGuessOverlay(votingGuessingPlayer, declaringGuess?.displayName || 'A spy')}
      </div>
    );
  }

  // ── ENDED PHASE ───────────────────────────────────────────────────────────

  if (gameState.phase === 'ended') {
    const winner = gameState.winner;
    const townWon = winner === 'town';
    const spyIds = gameState.spyIds || [];
    const spyPlayers = spyIds.map((uid) => getPlayerByUid(uid)).filter(Boolean);
    const endedLocationName = gameState.location || 'UNKNOWN';
    const endedLocationSizeClass = endedLocationName.length > 10 ? 'text-2xl' : 'text-4xl';

    return (
      <div className="spyfall-game font-sans min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="w-full max-w-md mx-auto p-6">
          <div className="mb-6 text-left">
            <p className="uppercase text-xs tracking-widest text-[#7a8c9e] mb-2" style={{ fontFamily: "'Courier Prime', monospace" }}>OPERATION SPYFALL</p>
            <h1
              className={`font-bold text-3xl ${townWon ? 'text-[#c9882a]' : 'text-[#cc3333]'}`}
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {townWon ? 'SPY IDENTIFIED' : 'OPERATIVE UNDETECTED'}
            </h1>
            <p
              className={`uppercase text-xs tracking-widest mt-1 ${townWon ? 'text-[#2d5a3d]' : 'text-[#8b1a1a]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {townWon ? 'MISSION COMPLETE - OPERATIVE COMPROMISED' : 'THE SPY EVADED CAPTURE'}
            </p>
          </div>

          {/* Reveal location */}
          <div className="relative w-full mb-4 rotate-[-2deg]">
            <div
              className="relative h-[120px] overflow-visible flex items-center"
              style={{
                width: '100%'
              }}
            >
              {/* Unified tag shape: one outer leather silhouette, one inner insert, one stitch perimeter */}
              <svg
                className="absolute inset-0 pointer-events-none"
                viewBox="0 0 360 120"
                preserveAspectRatio="none"
              >
                <path
                  d="M 78 10 L 334 10 Q 346 10 346 22 L 346 98 Q 346 110 334 110 L 78 110 L 44 86 L 24 86 Q 20 86 20 82 L 20 38 Q 20 34 24 34 L 44 34 L 78 10 Z"
                  fill="#6b4226"
                />
                <path
                  d="M 86 20 L 326 20 Q 336 20 336 30 L 336 90 Q 336 100 326 100 L 86 100 L 58 80 L 38 80 Q 34 80 34 76 L 34 44 Q 34 40 38 40 L 58 40 L 86 20 Z"
                  fill="#f0e6cc"
                />
                <path
                  d="M 81 16 L 330 16 Q 341 16 341 27 L 341 93 Q 341 104 330 104 L 81 104 L 53 82 L 29 82 L 29 38 L 53 38 L 81 16 Z"
                  fill="none"
                  stroke="#8b7449"
                  strokeWidth="2"
                  strokeDasharray="5,3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.72"
                />
                <circle cx="48" cy="60" r="10" fill="#0d1117" stroke="#7a6a45" strokeWidth="2" />
              </svg>

              <div className="relative z-10 flex items-center justify-center w-full px-4 py-3 gap-3 pt-7">
                <div className="flex-1 min-w-0 pl-24">
                  <p
                    className="uppercase tracking-widest text-[9px] text-[#2c1810]/80 leading-tight"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    DESTINATION
                  </p>
                  <h2
                    className={`${endedLocationSizeClass} text-[#2c1810] font-black leading-none truncate`}
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    {endedLocationName}
                  </h2>
                </div>

                <div className="w-px h-12 bg-[#8b7449]/60" />

                <div className="w-6 h-16 flex items-center justify-center flex-shrink-0 pr-5">
                  <p className="uppercase tracking-widest text-[#2c1810]/75 whitespace-nowrap rotate-[-90deg] origin-center" style={{ fontFamily: "'Courier Prime', monospace", lineHeight: '1', fontSize: '6px' }}>
                    ITS GAMES NIGHT
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Reveal spies */}
          <div className="relative overflow-hidden rounded-xl p-5 mb-6 text-left shadow-lg" style={{ backgroundColor: '#d4b483', border: '1px solid #8b6b3f' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono font-bold uppercase tracking-widest text-sm" style={{ color: '#3a2a1a' }}>
                CASE:
              </span>
              <span
                className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
                style={{
                  borderColor: townWon ? '#5a7a9a' : '#8b3a3a',
                  color: townWon ? '#5a7a9a' : '#8b3a3a',
                  transform: 'rotate(-6deg)',
                  fontSize: '10px'
                }}
              >
                CLOSED
              </span>
            </div>

            <div style={{ height: '1px', backgroundColor: '#4a3622', marginBottom: '16px', opacity: '0.45' }} />

            <div style={{ backgroundColor: '#eadfca', border: '1px solid #8b6b3f', borderRadius: '8px', padding: '16px' }}>
              <p className="text-[#3a2a1a] text-[11px] font-mono uppercase tracking-widest mb-3">AGENTS ASSIGNED: {(gameState.players || []).length}</p>
              <div className="border-t border-[#8b6b3f]/40 mb-3" />
              <div>
                {(gameState.players || []).map((player, idx) => {
                  const wasSpy = spyIds.includes(player.uid);

                  return (
                    <div key={player.uid}>
                      <div
                        className="relative flex items-center justify-between py-3"
                        style={{
                          backgroundColor: idx % 2 === 0 ? 'transparent' : '#f3ead8/40'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {renderAvatar(player, 'w-8 h-8', 'text-xs')}
                          <span className="font-mono font-semibold uppercase" style={{ color: '#2f2418', fontSize: '14px' }}>
                            {player.displayName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {wasSpy && (
                            <span
                              className="border-2 rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-widest opacity-80"
                              style={{
                                borderColor: '#cc3333',
                                color: '#cc3333',
                                transform: 'rotate(6deg)',
                                fontSize: '10px',
                                fontFamily: "'Courier Prime', monospace"
                              }}
                            >
                              SPY
                            </span>
                          )}
                        </div>
                      </div>

                      {idx < (gameState.players || []).length - 1 && (
                        <div style={{ height: '1px', backgroundColor: '#8b6b3f', opacity: '0.25' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {isHost ? (
            <div className="space-y-3">
              <button
                onClick={handlePlayAgain}
                className="spy-mono w-full bg-violet-600 hover:bg-violet-700 text-white uppercase tracking-widest font-bold py-4 rounded-xl transition-colors"
              >
                Play Again
              </button>
              <button
                onClick={handleEndGame}
                className="spy-mono w-full bg-[#1e2a3a] hover:bg-[#26364a] border border-[#2e3f52] text-[#7a8c9e] uppercase tracking-widest font-bold py-4 rounded-xl transition-colors"
              >
                End Game
              </button>
            </div>
          ) : (
            <div className="bg-[#1e2a3a] border border-[#2e3f52] rounded-xl p-4 text-center">
              <p className="spy-mono italic text-[#7a8c9e]">Thanks for playing!</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
