import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { arrayUnion } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { endActivity, useRoom } from '../hooks/useRoom';
import { transitionActivity, updateActivity, useAutoAdvance, useCountdown } from '../lib/activity';
import { getInitials } from '../utils/avatar';
import { MAFIA_SOUNDS, playSound, preloadMafiaSounds } from '../mafia/sounds';
import VotingPanel from './VotingPanel';
import GameShell, { GameLoading } from './GameShell';
import { useToast } from './Toast';
import mafiaRoleCardImage from '../assets/mafia/mafia-card.webp';
import detectiveRoleCardImage from '../assets/mafia/detective-card.webp';
import doctorRoleCardImage from '../assets/mafia/doctor-card.webp';
import civilianRoleCardImage from '../assets/mafia/civilian-card.webp';
import cardBackImage from '../assets/mafia/card-back.webp';
import { KILL_NOTE, SAVE_NOTE } from '../mafia/causes';
import {
  activeActorUids,
  advanceMafia,
  allConfirmedJump,
  allReadyToVote,
  resolveDayVote,
  selectableTargets,
  startDayVoteUpdates,
  startNightUpdates
} from '../games/mafia/logic';

const PHASE_SOUNDS = {
  'night-eyes-closed': MAFIA_SOUNDS.NIGHT_START,
  'night-mafia': MAFIA_SOUNDS.MAFIA_WAKE,
  'night-doctor': MAFIA_SOUNDS.DOCTOR_WAKE,
  'night-detective': MAFIA_SOUNDS.DETECTIVE_WAKE,
  'day-discussion': MAFIA_SOUNDS.DAY_START
};

export default function MafiaGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading, error: roomError } = useRoom(roomId, user);

  const gameState = room?.activeActivity?.type === 'mafia' ? room.activeActivity : null;
  const phase = gameState?.phase || null;
  const phaseId = gameState?.phaseId ?? 0;

  const [showRole, setShowRole] = useState(false);
  const [isRoleCardFrontVisible, setIsRoleCardFrontVisible] = useState(false);
  const [isCardFlipping, setIsCardFlipping] = useState(false);
  const [cardRotationY, setCardRotationY] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [busy, setBusy] = useState(false);
  const flipTimeoutsRef = useRef([]);
  const lastSoundPhaseRef = useRef(null);

  const timeLeft = useCountdown(gameState?.phaseEndsAt || null);
  const activeRules = gameState?.rules || {};

  const me = gameState?.players?.find((p) => p.uid === user?.id) || null;
  const myRole = me?.role || null;
  const confirmedVotes = gameState?.confirmedVotes || [];
  const hasConfirmed = Boolean(user?.id && confirmedVotes.includes(user.id));
  const readyClicked = Boolean(user?.id && (gameState?.readyVotes || []).includes(user.id));

  // Order of living players (by uid) decides who acts as fallback when the host is away
  const fallbackRank = useMemo(() => {
    const ids = (gameState?.players || []).map((p) => p.uid).filter((uid) => room?.playerIds?.includes(uid)).sort();
    const index = ids.indexOf(user?.id);
    return index < 0 ? 99 : index;
  }, [gameState?.players, room?.playerIds, user?.id]);

  useEffect(() => {
    preloadMafiaSounds();
  }, []);

  // ── Sounds on phase change ──────────────────────────────────────────────
  useEffect(() => {
    if (!phase || lastSoundPhaseRef.current === `${phaseId}`) return;
    lastSoundPhaseRef.current = `${phaseId}`;
    if (PHASE_SOUNDS[phase]) playSound(PHASE_SOUNDS[phase]);
  }, [phase, phaseId]);

  // Reset local selection whenever the phase changes
  useEffect(() => {
    if (!gameState) return;
    const own = gameState.nightVotes?.[user?.id] || gameState.dayVotes?.[user?.id] || null;
    setSelectedPlayer(own);
  }, [phaseId]);  

  useEffect(() => () => flipTimeoutsRef.current.forEach((id) => clearTimeout(id)), []);

  useEffect(() => {
    if (phase === 'roles') return;
    flipTimeoutsRef.current.forEach((id) => clearTimeout(id));
    flipTimeoutsRef.current = [];
    setShowRole(false);
    setIsRoleCardFrontVisible(false);
    setIsCardFlipping(false);
    setCardRotationY(0);
  }, [phase]);

  const guard = { type: 'mafia', phaseId };

  // ── Timed phases: host advances, others step in if the host is away ─────
  useAutoAdvance({
    key: gameState?.phaseEndsAt ? `${phaseId}:${gameState.phaseEndsAt}` : null,
    dueAt: gameState?.phaseEndsAt || null,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, guard, (activity) => advanceMafia(activity))
  });

  // Everyone who needs to act has confirmed -> shorten timer to 5s
  const jumpDue = Boolean(gameState && allConfirmedJump(gameState));
  useAutoAdvance({
    key: jumpDue ? `jump:${phaseId}` : null,
    due: jumpDue,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, guard, (activity) => allConfirmedJump(activity))
  });

  // Everyone alive is ready to vote -> start voting
  const readyDue = Boolean(gameState && allReadyToVote(gameState));
  useAutoAdvance({
    key: readyDue ? `ready:${phaseId}` : null,
    due: readyDue,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, { ...guard, phase: 'day-discussion' }, (activity) => (
      allReadyToVote(activity) ? startDayVoteUpdates(activity) : null
    ))
  });

  const getPlayerPhoto = (player) => player?.photo || room?.players?.find((p) => p.id === player?.uid)?.photo || null;

  const renderPlayerAvatar = (player, sizeClasses, textSizeClasses = 'text-sm', extraClasses = '') => {
    const playerPhoto = getPlayerPhoto(player);
    if (playerPhoto) {
      return (
        <img
          src={playerPhoto}
          alt={player.displayName}
          className={`${sizeClasses} rounded-full object-cover ${extraClasses}`.trim()}
        />
      );
    }
    return (
      <div className={`${sizeClasses} ${player.avatarColor || 'bg-slate-600'} rounded-full flex items-center justify-center text-white font-bold ${textSizeClasses} ${extraClasses}`.trim()}>
        {getInitials(player.displayName)}
      </div>
    );
  };

  const isCurrentUserAlive = () => Boolean(me && me.isAlive);
  const getSelectablePlayers = () => selectableTargets(gameState, user?.id);

  const runRoleCardFlip = (nextFrontVisible) => {
    if (isCardFlipping) return;
    flipTimeoutsRef.current.forEach((id) => clearTimeout(id));
    setIsCardFlipping(true);
    setCardRotationY(90);
    const halfway = setTimeout(() => {
      setIsRoleCardFrontVisible(nextFrontVisible);
      setCardRotationY(0);
    }, 300);
    const complete = setTimeout(() => {
      setShowRole(nextFrontVisible);
      setIsCardFlipping(false);
      flipTimeoutsRef.current = [];
    }, 600);
    flipTimeoutsRef.current = [halfway, complete];
  };

  const handleRevealRole = () => {
    if (showRole || isCardFlipping) return;
    runRoleCardFlip(true);
  };

  const handleHideRole = () => {
    if (!showRole || isCardFlipping) return;
    runRoleCardFlip(false);
  };

  const withBusy = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      console.error(error);
      toast.error('Something went wrong. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const startNightPhase = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'roles' }, (activity) => startNightUpdates(activity))
  ));

  const handleVotePlayer = async (targetUid) => {
    if (!user || hasConfirmed || !gameState || !isCurrentUserAlive()) return;
    setSelectedPlayer(targetUid);
    if (phase === 'night-mafia' && myRole === 'mafia') {
      // Let fellow mafia see who you're leaning towards
      updateActivity(roomId, {
        [`mafiaSelections.${user.id}`]: { targetUid, confirmed: false }
      }).catch(() => {});
    }
  };

  const handleConfirmVote = () => withBusy(async () => {
    if (!user || !selectedPlayer || hasConfirmed || !gameState || !isCurrentUserAlive()) return;
    if (!activeActorUids(gameState).includes(user.id)) return;
    const updates = {
      [`nightVotes.${user.id}`]: selectedPlayer,
      confirmedVotes: arrayUnion(user.id)
    };
    if (phase === 'night-mafia') {
      updates[`mafiaSelections.${user.id}`] = { targetUid: selectedPlayer, confirmed: true };
    }
    await updateActivity(roomId, updates);
  });

  const handleSubmitDayVote = async (targetUid) => {
    if (!user || !targetUid || !gameState || phase !== 'day-vote') throw new Error('Vote unavailable');
    if (!isCurrentUserAlive()) throw new Error('Only alive players can vote');
    await updateActivity(roomId, {
      [`dayVotes.${user.id}`]: targetUid,
      confirmedVotes: arrayUnion(user.id)
    });
    setSelectedPlayer(targetUid);
  };

  const handleEndDayVoting = () => transitionActivity(
    roomId,
    { ...guard, phase: 'day-vote' },
    (activity) => resolveDayVote(activity)
  );

  const handleReadyToVote = () => withBusy(async () => {
    if (!gameState || !user || phase !== 'day-discussion' || readyClicked || !isCurrentUserAlive()) return;
    await updateActivity(roomId, { readyVotes: arrayUnion(user.id) });
  });

  const handleStartVotingNow = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'day-discussion' }, (activity) => startDayVoteUpdates(activity))
  ));

  const handleReturnToGamesNight = () => withBusy(async () => {
    if (isHost) await endActivity(roomId);
    navigate(`/room/${roomId}`);
  });

  const isSpectator = () => {
    if (!myRole) return true;
    return Boolean(me && !me.isAlive);
  };

  const isDeadSpectator = () => Boolean(me && !me.isAlive);

  const renderEliminatedBanner = () => (
    <div className="relative overflow-hidden bg-[#e3d2ad] border border-[#c4ab78] rounded-lg p-4 mb-6 text-center shadow-lg">
      <h2 className="text-black font-serif font-black text-lg uppercase tracking-wide">
        YOU HAVE BEEN
        <span
          className="inline-block align-middle ml-2 border-2 border-[#6d1010] rounded-sm px-2 py-1 text-[#6d1010] text-xs font-bold uppercase tracking-widest opacity-80"
          style={{ transform: 'rotate(10deg)', fontFamily: "'Courier Prime', monospace" }}
        >
          ELIMINATED
        </span>
      </h2>
    </div>
  );

  const getRoleIcon = (role) => {
    switch (role) {
      case 'mafia': return '🔪';
      case 'civilian': return '👤';
      case 'doctor': return '🩺';
      case 'detective': return '🔍';
      default: return '❓';
    }
  };

  const getRoleCardImage = (role) => {
    switch (role) {
      case 'mafia': return mafiaRoleCardImage;
      case 'detective': return detectiveRoleCardImage;
      case 'doctor': return doctorRoleCardImage;
      case 'civilian': return civilianRoleCardImage;
      default: return cardBackImage;
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (authLoading || roomLoading) return <GameLoading />;
  if (!user) return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}/games/mafia` }} />;
  if (roomError || !room) return <Navigate to={`/room/${roomId}`} replace />;
  if (!gameState || phase === 'lobby') return <Navigate to={`/room/${roomId}`} replace />;

  return (
    <GameShell roomId={roomId} isHost={isHost} gameName="Mafia" onEndGame={() => endActivity(roomId)}>
      {renderPhase()}
    </GameShell>
  );

  function renderPhase() {
  // Phase 3: Role reveal
  if (gameState?.phase === 'roles') {
    if (!myRole) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
              <div className="text-6xl mb-4">⏳</div>
              <p className="text-slate-300 text-lg">Waiting for host to start the night...</p>
            </div>
          </div>
        </div>
      );
    }

    const displayedRoleCardImage = isRoleCardFrontVisible ? getRoleCardImage(myRole) : cardBackImage;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="text-white text-2xl font-bold mb-6">For your eyes only</h1>

            <div
              className="mx-auto w-[200px] h-[280px]"
              style={{
                perspective: '600px',
                WebkitPerspective: '600px'
              }}
            >
              <img
                src={displayedRoleCardImage}
                alt={showRole ? `${myRole} role card` : 'Mafia role card back'}
                className="w-full h-full rounded-2xl border border-white/20 object-cover shadow-2xl"
                style={{
                  transform: `rotateY(${cardRotationY}deg)`,
                  WebkitTransform: `rotateY(${cardRotationY}deg)`,
                  transition: 'transform 0.3s ease',
                  WebkitTransition: '-webkit-transform 0.3s ease, transform 0.3s ease',
                  transformStyle: 'preserve-3d',
                  WebkitTransformStyle: 'preserve-3d',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden'
                }}
              />
            </div>

            {!showRole ? (
              <button
                onClick={handleRevealRole}
                disabled={isCardFlipping}
                className="w-full max-w-[18rem] mx-auto h-14 mt-6 flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
              >
                Reveal Role
              </button>
            ) : (
              <button
                onClick={handleHideRole}
                disabled={isCardFlipping}
                className="w-full max-w-[18rem] mx-auto h-14 mt-6 flex items-center justify-center bg-white/20 hover:bg-white/30 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
              >
                Hide
              </button>
            )}
          </div>

          <div className="mt-6">
            {isHost ? (
              <button
                onClick={startNightPhase}
                disabled={busy}
                className="w-full max-w-[18rem] mx-auto h-14 flex items-center justify-center bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold rounded-xl transition-colors"
              >
                Start Night
              </button>
            ) : (
              <div className="w-full max-w-[18rem] mx-auto h-14 bg-slate-800/50 border border-slate-700 rounded-xl flex items-center justify-center text-center px-3">
                <p className="text-slate-300">Waiting for host to start the night...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Night phase - Eyes closed
  if (gameState?.phase?.startsWith('night-eyes-closed')) {
    const isInitialNight = gameState?.phase === 'night-eyes-closed';
    const isFirstRound = (gameState?.roundNumber ?? 1) === 1;
    const showFirstNightVolumePrompt =
      isInitialNight &&
      isFirstRound &&
      timeLeft !== null &&
      timeLeft > 5;

    if (showFirstNightVolumePrompt) {
      const volumeCountdown = Math.max(1, Math.min(7, timeLeft - 5));
      return (
        <div className="min-h-screen bg-black p-6 flex items-center justify-center">
          <div className="text-center">
            <div className="text-9xl mb-8">🔊</div>
            <h1 className="text-white text-4xl font-black mb-4">Turn up your volume</h1>
            <p className="text-slate-300 text-lg mb-12">Sound effects are coming...</p>
            <div className="text-6xl font-bold text-slate-400">{volumeCountdown}</div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-black p-6">
        <div className="w-full max-w-md mx-auto">
          {isDeadSpectator() && renderEliminatedBanner()}

          <div className="min-h-[70vh] flex items-center justify-center">
            <div className="text-center">
              <div className="text-8xl mb-6">😴</div>
              <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
              {timeLeft !== null && (
                <p className="text-slate-300 font-mono text-2xl mt-4">{formatTime(timeLeft)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Night phase - Mafia turn
  if (gameState?.phase === 'night-mafia') {
    const isMafia = myRole === 'mafia' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    const spectator = isSpectator();

    if (spectator) {
      // Show spectator view
      const mafiaVotes = gameState.nightVotes || {};
      const selectablePlayers = getSelectablePlayers();

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 pt-16">
          <div className="w-full max-w-md mx-auto">
            {isDeadSpectator() && renderEliminatedBanner()}

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Mafia Voting</h3>
                {timeLeft !== null && (
                  <p className="text-red-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>

              <div className="space-y-2">
                {selectablePlayers.map((player) => {
                  const voteCount = Object.values(mafiaVotes).filter(v => v === player.uid).length;
                  return (
                    <div
                      key={player.uid}
                      className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {renderPlayerAvatar(player, 'w-10 h-10', 'text-sm')}
                        <span className="text-white">{player.displayName}</span>
                      </div>
                      {voteCount > 0 && (
                        <span className="text-red-400 font-bold">{voteCount} 🔪</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isMafia) {
      return (
        <div className="min-h-screen bg-black p-6">
          <div className="w-full max-w-md mx-auto">
            {isDeadSpectator() && renderEliminatedBanner()}

            <div className="min-h-[70vh] flex items-center justify-center">
              <div className="text-center">
                <div className="text-8xl mb-6">😴</div>
                <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Active mafia player
    const selectablePlayers = getSelectablePlayers();
    const mafiaPlayers = gameState.players.filter((player) => player.role === 'mafia');
    const sortedMafiaPlayers = [...mafiaPlayers].sort((a, b) => {
      if (a.isAlive === b.isAlive) return 0;
      return a.isAlive ? -1 : 1;
    });
    const mafiaSelections = gameState.mafiaSelections || {};
    const showMafiaCoordination = true;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-red-900 to-red-950 p-6 pt-16">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {timeLeft !== null && (
              <div className="text-red-300 font-mono text-4xl mb-2">{formatTime(timeLeft)}</div>
            )}
            <h2 className="text-white text-xl font-semibold">Choose a player to kill</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.map((player) => {
              const selectorsForPlayer = mafiaPlayers.filter(
                (mafiaPlayer) => mafiaSelections[mafiaPlayer.uid]?.targetUid === player.uid
              );

              return (
                <button
                  key={player.uid}
                  onClick={() => handleVotePlayer(player.uid)}
                  disabled={hasConfirmed}
                  className={`flex items-start gap-3 rounded-xl p-4 transition-all ${
                    selectedPlayer === player.uid
                      ? 'bg-red-600 ring-2 ring-white'
                      : 'bg-slate-800/50 hover:bg-slate-700'
                  } ${hasConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {renderPlayerAvatar(player, 'w-12 h-12', 'text-base')}
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-white font-semibold block">{player.displayName}</span>
                    {showMafiaCoordination && selectorsForPlayer.length > 0 && (
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {selectorsForPlayer.map((mafiaPlayer) => {
                          const selection = mafiaSelections[mafiaPlayer.uid];
                          const isConfirmedSelection = selection?.confirmed === true;
                          return (
                            <div
                              key={mafiaPlayer.uid}
                              className={`${isConfirmedSelection ? 'opacity-100' : 'opacity-40'} transition-opacity`}
                              title={`${mafiaPlayer.displayName}${isConfirmedSelection ? ' (confirmed)' : ' (selecting)'}`}
                            >
                              {renderPlayerAvatar(mafiaPlayer, 'w-8 h-8', 'text-xs')}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <button
            onClick={handleConfirmVote}
            disabled={!selectedPlayer || hasConfirmed}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-red-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {hasConfirmed ? 'Vote Confirmed' : 'Confirm'}
          </button>

          {showMafiaCoordination && (
            <div className="mt-6 rounded-xl border border-red-900/60 bg-black/20 p-4">
              <p className="text-red-200/80 text-[11px] font-mono uppercase tracking-widest mb-3">
                Look up to coordinate with your team
              </p>
              <div className="space-y-2">
                {sortedMafiaPlayers.map((mafiaPlayer) => {
                  const isEliminatedMafia = mafiaPlayer.isAlive === false;
                  return (
                    <div key={mafiaPlayer.uid} className="flex items-center gap-3">
                      <div className={isEliminatedMafia ? 'opacity-30' : 'opacity-100'}>
                        {renderPlayerAvatar(mafiaPlayer, 'w-9 h-9', 'text-xs')}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isEliminatedMafia ? 'text-red-100/30 line-through' : 'text-red-100'}`}>
                          {mafiaPlayer.displayName}
                        </span>
                        {isEliminatedMafia && (
                          <span className="text-[11px] uppercase tracking-wide text-red-300/60">eliminated</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Night phase - Doctor turn
  if (gameState?.phase === 'night-doctor') {
    const isDoctor = myRole === 'doctor' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    const spectator = isSpectator();
    const doctorDead = !gameState.players.find(p => p.role === 'doctor' && p.isAlive);

    if (spectator && !doctorDead) {
      const doctorVote = gameState.nightVotes || {};
      const selectablePlayers = getSelectablePlayers();

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 pt-16">
          <div className="w-full max-w-md mx-auto">
            {isDeadSpectator() && renderEliminatedBanner()}

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Doctor Turn</h3>
                {timeLeft !== null && (
                  <p className="text-green-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>

              <div className="space-y-2">
                {selectablePlayers.map((player) => {
                  const voteCount = Object.values(doctorVote).filter((v) => v === player.uid).length;
                  return (
                    <div
                      key={player.uid}
                      className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {renderPlayerAvatar(player, 'w-10 h-10', 'text-sm')}
                        <span className="text-white">{player.displayName}</span>
                      </div>
                      {voteCount > 0 && (
                        <span className="text-green-400 font-bold">🩺</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isDoctor) {
      return (
        <div className="min-h-screen bg-black p-6">
          <div className="w-full max-w-md mx-auto">
            {isDeadSpectator() && renderEliminatedBanner()}

            <div className="min-h-[70vh] flex items-center justify-center">
              <div className="text-center">
                <div className="text-8xl mb-6">😴</div>
                <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Active doctor player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-green-950 p-6 pt-16">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {timeLeft !== null && (
              <div className="text-green-300 font-mono text-4xl mb-2">{formatTime(timeLeft)}</div>
            )}
            <h2 className="text-white text-xl font-semibold">Choose who to save</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.map((player) => (
              <button
                key={player.uid}
                onClick={() => handleVotePlayer(player.uid)}
                disabled={hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid
                    ? 'bg-green-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${hasConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {renderPlayerAvatar(player, 'w-12 h-12', 'text-base')}
                <span className="text-white font-semibold">{player.displayName}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleConfirmVote}
            disabled={!selectedPlayer || hasConfirmed}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-green-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {hasConfirmed ? 'Saved' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  // Night phase - Detective turn
  if (gameState?.phase === 'night-detective') {
    const isDetective = myRole === 'detective' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    const spectator = isSpectator();
    const detectiveDead = !gameState.players.find(p => p.role === 'detective' && p.isAlive);

    if (spectator && !detectiveDead) {
      const detectiveVote = gameState.nightVotes || {};
      const selectablePlayers = getSelectablePlayers();

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 pt-16">
          <div className="w-full max-w-md mx-auto">
            {isDeadSpectator() && renderEliminatedBanner()}

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Detective Turn</h3>
                {timeLeft !== null && (
                  <p className="text-yellow-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>

              <div className="space-y-2">
                {selectablePlayers.map((player) => {
                  const voteCount = Object.values(detectiveVote).filter((v) => v === player.uid).length;
                  return (
                    <div
                      key={player.uid}
                      className="bg-slate-700/50 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {renderPlayerAvatar(player, 'w-10 h-10', 'text-sm')}
                        <span className="text-white">{player.displayName}</span>
                      </div>
                      {voteCount > 0 && (
                        <span className="text-yellow-400 font-bold">🔍</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isDetective) {
      return (
        <div className="min-h-screen bg-black p-6">
          <div className="w-full max-w-md mx-auto">
            {isDeadSpectator() && renderEliminatedBanner()}

            <div className="min-h-[70vh] flex items-center justify-center">
              <div className="text-center">
                <div className="text-8xl mb-6">😴</div>
                <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Active detective player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-950 via-yellow-900 to-yellow-950 p-6 pt-16">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {timeLeft !== null && (
              <div className="text-yellow-300 font-mono text-4xl mb-2">{formatTime(timeLeft)}</div>
            )}
            <h2 className="text-white text-xl font-semibold">Who are you suspicious of?</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.map((player) => (
              <button
                key={player.uid}
                onClick={() => handleVotePlayer(player.uid)}
                disabled={hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid
                    ? 'bg-yellow-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${hasConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {renderPlayerAvatar(player, 'w-12 h-12', 'text-base')}
                <span className="text-white font-semibold">{player.displayName}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleConfirmVote}
            disabled={!selectedPlayer || hasConfirmed}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-yellow-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {hasConfirmed ? 'Investigating...' : 'Confirm'}
          </button>
        </div>
      </div>
    );
  }

  // Detective result
  if (gameState?.phase === 'night-detective-result') {
    const isDetective = myRole === 'detective' && gameState.players.find(p => p.uid === user?.id)?.isAlive;
    
    if (isDetective && gameState.detectiveResult) {
      const result = gameState.detectiveResult;
      return (
        <div className="min-h-screen bg-gradient-to-br from-yellow-950 via-yellow-900 to-yellow-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <p className="text-white text-3xl font-bold">
              {result.isMafia
                ? `${result.targetName} is the mafia`
                : `${result.targetName} is not the mafia`}
            </p>
          </div>
        </div>
      );
    }

    // Non-detective players - no timer during detective result phase
    return (
      <div className="min-h-screen bg-black p-6">
        <div className="w-full max-w-md mx-auto">
          {isDeadSpectator() && renderEliminatedBanner()}

          <div className="min-h-[70vh] flex items-center justify-center">
            <div className="text-center">
              <div className="text-8xl mb-6">😴</div>
              <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Day phase - Discussion
  if (gameState?.phase === 'day-discussion') {
    const spectator = isSpectator();
    const victimUid = gameState.pendingVictim;
    const saved = Boolean(gameState.lastSaved && gameState.lastSaved === victimUid);
    const victim = victimUid ? gameState.players.find(p => p.uid === victimUid) : null;
    const savedPlayer = gameState.lastSaved ? gameState.players.find((p) => p.uid === gameState.lastSaved) : null;
    const investigatedPlayer = gameState.detectiveResult?.targetUid
      ? gameState.players.find((p) => p.uid === gameState.detectiveResult.targetUid)
      : null;
    const nightReportCause = gameState.nightReportCause || '';
    const defaultReportNote = victim
      ? (saved ? SAVE_NOTE.replace('[Name]', victim.displayName) : KILL_NOTE)
      : '';
    const nightReportNote = gameState.nightReportNote || defaultReportNote;
    const livingPlayers = gameState.players.filter((p) => p.isAlive);
    const readyVotes = gameState.readyVotes || [];
    const canReadyToVote = !spectator && isCurrentUserAlive();
    const myReadyClicked = readyClicked || readyVotes.includes(user?.id);

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-[#020817] via-[#0b1325] to-[#020817] p-6 pt-16">
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background: 'radial-gradient(circle at center, rgba(127, 29, 29, 0) 58%, rgba(127, 29, 29, 0.13) 100%)'
          }}
        />

        <div className="relative z-10 w-full max-w-md mx-auto">
          {isDeadSpectator() && renderEliminatedBanner()}

          <div className="text-center mb-6">
            {victim && (
              <div className="relative overflow-hidden bg-[#e8dcc8] border border-[#c1ab89] rounded-xl p-5 mb-5 text-left shadow-lg">
                <p className="font-mono text-[#3f3127] text-xs font-bold tracking-[0.2em]">INCIDENT REPORT</p>
                <div className="border-t border-[#665341] my-3" />
                <p className="font-mono text-[#2f241c] text-sm">
                  {saved ? 'PATIENT' : 'VICTIM'}: {victim.displayName}
                </p>

                {spectator && activeRules.doctor && savedPlayer && (
                  <p className="font-mono text-[#2f241c] text-sm mt-1">
                    DOCTOR SAVE: {savedPlayer.displayName}
                  </p>
                )}

                {spectator && activeRules.detective && gameState.detectiveResult && (
                  <p className="font-mono text-[#2f241c] text-sm mt-1">
                    DETECTIVE CHECK: {investigatedPlayer?.displayName || gameState.detectiveResult.targetName}
                  </p>
                )}

                {!saved && (
                  <p className="font-mono text-[#2f241c] text-sm mt-1">
                    CAUSE: {nightReportCause}
                  </p>
                )}

                <p className="font-mono text-[#2f241c] text-sm mt-1">
                  STATUS: {saved ? 'ALIVE' : 'DECEASED'}
                </p>

                <p className="font-mono text-[#2f241c] text-sm mt-4 text-center">
                  {nightReportNote}
                </p>

                <div className="border-t border-[#665341] my-3" />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={`border-4 px-4 py-1 text-3xl font-black uppercase tracking-widest opacity-60 ${
                      saved ? 'border-green-900 text-green-900' : 'border-red-900 text-red-900'
                    }`}
                    style={{ transform: 'rotate(-15deg)' }}
                  >
                    {saved ? 'ALIVE' : 'DECEASED'}
                  </div>
                </div>
              </div>
            )}

            <div
              className="bg-[#0b1325] border border-[#334258] rounded-xl p-4 mb-6 text-[#f0e5cf] shadow-lg"
              style={{ transform: 'rotate(-1deg)' }}
            >
              <h2 className="font-serif text-2xl font-black uppercase tracking-wide">THE MORNING AFTER</h2>
              <div className="border-t border-[#f0e5cf]/60 my-2" />
              {timeLeft !== null && (
                <p className="font-serif text-4xl font-black">{formatTime(timeLeft)}</p>
              )}
            </div>
          </div>

          <div className="bg-[#0f1a2f] border border-[#334258] rounded-xl p-4 shadow-lg">
            <h3 className="text-[#e7dbc6] font-mono font-bold uppercase tracking-widest">SUSPECTS</h3>
            <div className="border-t border-red-700/70 mt-2 mb-3" />
            <div className="space-y-2">
              {livingPlayers.map((player) => (
                <div
                  key={player.uid}
                  className="flex items-center gap-3 bg-[#16233b] border border-[#334258] rounded-lg p-3"
                >
                  {renderPlayerAvatar(player, 'w-10 h-10', 'text-sm')}
                  <span className="text-[#e7dbc6] font-mono">{player.displayName}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-[#0f1a2f] border border-[#334258] rounded-xl p-4 mt-4 shadow-lg">
            <button
              onClick={handleReadyToVote}
              disabled={!canReadyToVote || myReadyClicked}
              className={`w-full py-3 rounded-md font-black uppercase tracking-wide border-2 transition-colors ${
                canReadyToVote
                  ? myReadyClicked
                    ? 'border-[#3e4d63] bg-[#1f2a3f] text-[#7e8ea6] cursor-not-allowed'
                    : 'border-[#e7dbc6] bg-[#0f1a2f] hover:bg-[#16233b] text-[#f2e8d3]'
                  : 'border-[#3e4d63] bg-[#1f2a3f] text-[#7e8ea6] cursor-not-allowed'
              }`}
            >
              {myReadyClicked ? 'BALLOT READY' : 'READY TO VOTE'}
            </button>
            <p className="text-[#c7baa3] text-sm mt-3 font-mono">
              Ready: {readyVotes.length}/{livingPlayers.length}
            </p>
            <div className="flex items-center justify-center mt-3">
              {livingPlayers.map((player, index) => {
                const isReady = readyVotes.includes(player.uid);
                const playerPhoto = getPlayerPhoto(player);
                return (
                  playerPhoto ? (
                    <img
                      key={player.uid}
                      src={playerPhoto}
                      alt={player.displayName}
                      className={`w-7 h-7 rounded-full border-2 border-[#0f1a2f] object-cover ${index > 0 ? '-ml-2' : ''} ${isReady ? '' : 'opacity-50 grayscale'}`}
                      title={`${player.displayName}${isReady ? ' (Ready)' : ' (Not ready)'}`}
                    />
                  ) : (
                    <div
                      key={player.uid}
                      className={`w-7 h-7 rounded-full border-2 border-[#0f1a2f] flex items-center justify-center text-[10px] font-bold ${index > 0 ? '-ml-2' : ''} ${
                        isReady ? `${player.avatarColor} text-white` : 'bg-[#3a4760] text-[#9faec4]'
                      }`}
                      title={`${player.displayName}${isReady ? ' (Ready)' : ' (Not ready)'}`}
                    >
                      {getInitials(player.displayName)}
                    </div>
                  )
                );
              })}
            </div>

            {isHost && (
              <button
                onClick={handleStartVotingNow}
                className="w-full mt-3 border-2 border-[#e7dbc6] bg-[#0f1a2f] hover:bg-[#16233b] text-[#f2e8d3] font-black uppercase tracking-wide py-3 rounded-md transition-colors"
              >
                Start Voting
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Day phase - Voting
  if (gameState?.phase === 'day-vote') {
    const selectablePlayers = getSelectablePlayers().filter((player) => player.isAlive === true);
    const dayVotes = gameState.dayVotes || {};
    const formattedTimeLeft = timeLeft !== null ? formatTime(timeLeft) : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 pt-16">
        <div className="w-full max-w-md mx-auto">
          {isDeadSpectator() && renderEliminatedBanner()}

          <VotingPanel
            players={selectablePlayers}
            votes={dayVotes}
            currentUid={user?.id}
            isHost={isHost}
            onVote={handleSubmitDayVote}
            onEndVoting={handleEndDayVoting}
            theme="ballot"
            timerLabel="TIME REMAINING"
            timerValue={formattedTimeLeft}
          />
        </div>
      </div>
    );
  }

  // Day result - who was voted out
  if (gameState?.phase === 'day-result') {
    const eliminatedPlayer = gameState.lastEliminated
      ? gameState.players.find((p) => p.uid === gameState.lastEliminated)
      : null;
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#020817] via-[#0b1325] to-[#020817] flex items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          {isDeadSpectator() && gameState.lastEliminated !== user?.id && renderEliminatedBanner()}
          <div className="relative overflow-hidden bg-[#e8dcc8] border border-[#c1ab89] rounded-xl p-6 text-left shadow-lg">
            <p className="font-mono text-[#3f3127] text-xs font-bold tracking-[0.2em]">THE TOWN HAS SPOKEN</p>
            <div className="border-t border-[#665341] my-3" />
            {eliminatedPlayer ? (
              <div className="flex items-center gap-4">
                {renderPlayerAvatar(eliminatedPlayer, 'w-14 h-14', 'text-lg')}
                <div>
                  <p className="font-mono text-[#2f241c] text-lg font-bold uppercase">{eliminatedPlayer.displayName}</p>
                  <p className="font-mono text-[#5a4837] text-sm">
                    {eliminatedPlayer.uid === user?.id ? 'You were voted out.' : 'was voted out.'}
                    {gameState.dayVoteTie ? ' (tie broken at random)' : ''}
                  </p>
                </div>
              </div>
            ) : (
              <p className="font-mono text-[#2f241c] text-base">No votes were cast. Nobody was eliminated.</p>
            )}
            <div className="border-t border-[#665341] my-3" />
            <p className="font-mono text-[#5a4837] text-sm text-center">Night falls again soon...</p>
            {timeLeft !== null && (
              <p className="font-serif text-3xl font-black text-[#3f3127] text-center mt-2">{timeLeft}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // End game
  if (gameState?.phase === 'ended') {
    const winner = gameState.winner;
    const townWon = winner === 'town';
    const mafiaCount = gameState.players?.filter((player) => player.role === 'mafia').length || 0;
    const eliminatedCount = gameState.players?.filter((player) => player.isAlive === false).length || 0;
    const nightsCount = Number.isInteger(gameState?.roundNumber) ? gameState.roundNumber : null;
    const totalRoundsPlayed = Number.isInteger(gameState?.roundNumber) ? gameState.roundNumber : 1;
    const rightMetaText = nightsCount !== null ? `NIGHTS: ${nightsCount}` : `ELIMINATED: ${eliminatedCount}`;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 pt-16">
        <div className="w-full max-w-md mx-auto">
          {/* Newspaper Masthead - Classic Broadsheet Style */}
          <div className="mb-8 text-[#e8e0d0]" style={{ fontFamily: 'serif' }}>
            {/* Top metadata bar */}
            <div className="border-t-2 border-[#e8e0d0]/40 mb-2" style={{ fontSize: '1px' }} />
            <div className="flex items-center justify-between py-1 mb-2 text-[15px] leading-none">
              <span className="font-mono tracking-wider">MAFIAS: {mafiaCount}</span>
              <span className="font-mono text-center flex-1">THE GAMES NIGHT GAZETTE</span>
              <span className="font-mono tracking-wider">{rightMetaText}</span>
            </div>

            {/* Double Rule */}
            <div className="border-t-2 border-[#e8e0d0]/60" style={{ marginBottom: '2px' }} />
            <div className="border-t border-[#e8e0d0]/40 mb-4" />

            {/* Headline */}
            <h1
              className="font-black uppercase text-center mb-2"
              style={{
                fontSize: '3rem',
                letterSpacing: '0.1em',
                lineHeight: '1.1',
                fontFamily: "'Playfair Display', 'Georgia', serif",
                fontWeight: 900
              }}
            >
              {townWon ? 'TOWN TRIUMPHS' : 'MAFIA REIGNS'}
            </h1>

            {/* Deck Line */}
            <p
              className="text-center italic mb-4"
              style={{
                fontSize: '14px',
                fontFamily: "'Georgia', serif",
                lineHeight: '1.4'
              }}
            >
              {townWon
                ? 'Mafia members identified and removed from the village'
                : 'Civilians deceived as mafia seizes control of the village'}
            </p>

            {/* Bottom Rule */}
            <div className="border-t border-[#e8e0d0]/40" />
          </div>

          {/* Case Closed Card */}
          <div className="relative overflow-hidden rounded-xl p-5 mb-6 text-left shadow-lg" style={{ backgroundColor: '#d4b483', border: '1px solid #8b6b3f' }}>
            {/* CASE Header */}
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

            {/* Divider */}
            <div style={{ height: '1px', backgroundColor: '#4a3622', marginBottom: '16px', opacity: '0.45' }} />

            {/* Player List */}
            <div style={{ backgroundColor: '#eadfca', border: '1px solid #8b6b3f', borderRadius: '8px', padding: '16px' }}>
              <p className="text-[#3a2a1a] text-[11px] font-mono uppercase tracking-widest mb-3">AGENTS ASSIGNED: {gameState.players?.length || 0}</p>
              <div className="border-t border-[#8b6b3f]/40 mb-3" />
              <div>
                {gameState.players.map((player, idx) => {
                  const survivedRounds = Number.isInteger(player.eliminatedRound)
                    ? Math.min(totalRoundsPlayed, player.eliminatedRound)
                    : totalRoundsPlayed;
                  const roundsLabel = `Rounds: ${survivedRounds}`;
                  const roleRoundsColor = player.role === 'mafia'
                    ? '#8b3a3a'
                    : player.role === 'doctor'
                      ? '#4a7c5a'
                      : player.role === 'detective'
                        ? '#8b6b3f'
                        : '#5a7a9a';

                  return (
                    <div key={player.uid}>
                      <div
                        className="relative flex items-center justify-between py-3"
                        style={{
                          backgroundColor: idx % 2 === 0 ? 'transparent' : '#f3ead8/40'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {renderPlayerAvatar(player, 'w-8 h-8', 'text-xs')}
                          <span className="font-mono font-semibold uppercase" style={{ color: '#2f2418', fontSize: '14px' }}>
                            {player.displayName}
                            <span style={{ marginLeft: '8px', fontSize: '12px', fontFamily: 'monospace', color: roleRoundsColor }}>
                              {roundsLabel}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                        {/* Mafia: stamp first, then emoji */}
                        {player.role === 'mafia' && (
                          <>
                            <span
                              className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
                              style={{
                                borderColor: '#8b3a3a',
                                color: '#8b3a3a',
                                transform: 'rotate(6deg)',
                                fontSize: '10px'
                              }}
                            >
                              MAFIA
                            </span>
                            <span className="text-lg">{getRoleIcon(player.role)}</span>
                          </>
                        )}

                        {/* Doctor: green stamp + emoji */}
                        {player.role === 'doctor' && (
                          <>
                            <span
                              className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
                              style={{
                                borderColor: '#4a7c5a',
                                color: '#4a7c5a',
                                transform: 'rotate(6deg)',
                                fontSize: '10px'
                              }}
                            >
                              Doctor
                            </span>
                            <span className="text-lg">{getRoleIcon(player.role)}</span>
                          </>
                        )}

                        {/* Detective: brown stamp + emoji */}
                        {player.role === 'detective' && (
                          <>
                            <span
                              className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
                              style={{
                                borderColor: '#8b6b3f',
                                color: '#8b6b3f',
                                transform: 'rotate(6deg)',
                                fontSize: '10px'
                              }}
                            >
                              Detective
                            </span>
                            <span className="text-lg">{getRoleIcon(player.role)}</span>
                          </>
                        )}

                        {/* Civilian: blue stamp + emoji */}
                        {player.role === 'civilian' && (
                          <>
                            <span
                              className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
                              style={{
                                borderColor: '#5a7a9a',
                                color: '#5a7a9a',
                                transform: 'rotate(6deg)',
                                fontSize: '10px'
                              }}
                            >
                              Civilian
                            </span>
                            <span className="text-lg">{getRoleIcon(player.role)}</span>
                          </>
                        )}

                        </div>

                      </div>
                      {idx < gameState.players.length - 1 && (
                        <div style={{ height: '1px', backgroundColor: '#8b6b3f', opacity: '0.25' }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Return Button */}
          <button
            onClick={handleReturnToGamesNight}
            disabled={busy}
            className="w-full bg-[#e8dcc8] hover:bg-[#f0e5cf] border border-[#c1ab89] text-[#3f3127] font-mono font-bold py-3 rounded-lg transition-colors tracking-wide"
          >
            {isHost ? 'Return to Its Games Night' : 'Back to room'}
          </button>
        </div>
      </div>
    );
  }

  return null;
}
}
