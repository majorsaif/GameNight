import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { arrayUnion } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { endActivity, useRoom } from '../hooks/useRoom';
import { transitionActivity, updateActivity, useAutoAdvance } from '../lib/activity';
import { participantsFromRoom } from '../lib/lobby';
import { getInitials } from '../utils/avatar';
import VotingPanel from '../components/VotingPanel';
import GameShell, { GameLoading } from '../components/GameShell';
import { useToast } from '../components/Toast';
import {
  activePlayersOf,
  allActiveReady,
  canDeclareGuess as canDeclareGuessFor,
  dealWordImposter,
  resolveImposterGuess,
  resolveWordImposterVote,
  startDescribingUpdates,
  startVotingUpdates
} from '../games/wordImposter/logic';

const DESCRIBE_COUNTDOWN_MS = 5000;

export default function WordImposterGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading, error: roomError } = useRoom(roomId, user);

  const gameState = room?.activeActivity?.type === 'wordImposter' ? room.activeActivity : null;
  const phaseId = gameState?.phaseId ?? 0;
  const [showWord, setShowWord] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setShowWord(false);
  }, [phaseId === 1, gameState?.word]);  

  // 5-second "get ready" countdown at the start of each describing round
  const describeStartedAt = gameState?.phase === 'describing' ? gameState.phaseStartedAt : null;
  useEffect(() => {
    if (!describeStartedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [describeStartedAt]);
  const countdown = describeStartedAt
    ? Math.max(0, Math.ceil((DESCRIBE_COUNTDOWN_MS - (now - describeStartedAt)) / 1000))
    : null;

  const presentUids = room?.playerIds || [];
  const isImposter = Boolean(gameState?.imposterIds?.includes(user?.id));
  const guessSystemEnabled = Boolean(gameState?.rules?.imposterNoWord);
  const showCategory = gameState?.rules?.showCategory !== false;
  const eliminatedPlayers = gameState?.eliminatedPlayers || [];
  const activePlayers = activePlayersOf(gameState);
  const activePlayerUids = activePlayers.map((p) => p.uid);
  const declaringGuess = guessSystemEnabled ? (gameState?.declaringGuess || null) : null;
  const isGuessPaused = Boolean(declaringGuess);
  const isCurrentPlayerEliminated = Boolean(user?.id && eliminatedPlayers.includes(user.id));
  const isActiveImposter = Boolean(isImposter && !isCurrentPlayerEliminated);
  const canDeclareGuess = Boolean(gameState && user?.id && canDeclareGuessFor(gameState, user.id));
  const readyClicked = Boolean(user?.id && (gameState?.readyVotes || []).includes(user.id));
  const guard = { type: 'wordImposter', phaseId };

  const fallbackRank = useMemo(() => {
    const ids = activePlayerUids.filter((uid) => presentUids.includes(uid)).sort();
    const index = ids.indexOf(user?.id);
    return index < 0 ? 99 : index;
  }, [activePlayerUids.join(','), presentUids.join(','), user?.id]);  

  // Everyone ready -> voting
  const readyDue = Boolean(gameState?.phase === 'describing' && !isGuessPaused && allActiveReady(gameState, presentUids));
  useAutoAdvance({
    key: readyDue ? `ready:${phaseId}` : null,
    due: readyDue,
    isHost,
    fallbackRank,
    advance: () => transitionActivity(roomId, { ...guard, phase: 'describing' }, (activity) => (
      activity.declaringGuess ? null : startVotingUpdates(activity)
    ))
  });

  const getPlayerByUid = (uid) => gameState?.players?.find((p) => p.uid === uid);
  const getPlayerPhoto = (playerOrUid) => {
    const uid = typeof playerOrUid === 'string' ? playerOrUid : playerOrUid?.uid;
    if (!uid) return null;
    const player = typeof playerOrUid === 'object' ? playerOrUid : getPlayerByUid(uid);
    return player?.photo || room?.players?.find((p) => p.id === uid)?.photo || null;
  };

  const getWordFontSize = (word) => {
    if (!word) return '1.6rem';
    if (word.length <= 8) return '1.6rem';
    if (word.length <= 12) return '1.2rem';
    if (word.length <= 16) return '1rem';
    return '0.85rem';
  };

  const getWinningAgentLabel = (state) => {
    if (!state) return null;
    if (state.rules?.imposterNoWord && state.winningAgent) return state.winningAgent;
    const eliminated = state.eliminatedPlayers || [];
    const imposterIds = state.imposterIds || [];
    const winners = state.winner === 'imposter' ? imposterIds.filter((uid) => !eliminated.includes(uid)) : imposterIds;
    const names = (winners.length ? winners : imposterIds).map((uid) => getPlayerByUid(uid)?.displayName || 'Unknown');
    return names.length ? names.join(', ') : null;
  };

  const withBusy = async (fn) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      console.error(error);
      toast.error(error?.message && !error.code ? error.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // === ACTIONS ===
  const handleStartDescribing = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'word-reveal' }, (activity) => startDescribingUpdates(activity))
  ));

  const handleReadyToVote = () => withBusy(async () => {
    if (!user || readyClicked || isCurrentPlayerEliminated || isGuessPaused) return;
    if (!activePlayerUids.includes(user.id)) return;
    await updateActivity(roomId, { readyVotes: arrayUnion(user.id) });
  });

  const handleStartVotingNow = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: 'describing' }, (activity) => startVotingUpdates(activity))
  ));

  const handleConfirmVote = async (targetUid) => {
    if (!user || !targetUid) throw new Error('Vote unavailable');
    if (isCurrentPlayerEliminated) throw new Error('Eliminated players cannot vote');
    if (isGuessPaused) throw new Error('Voting is paused');
    if (!activePlayerUids.includes(user.id) || !activePlayerUids.includes(targetUid)) throw new Error('Vote unavailable');
    if (targetUid === user.id) throw new Error('You cannot vote for yourself');
    await updateActivity(roomId, { [`votes.${user.id}`]: targetUid });
  };

  const handleEndVoting = () => transitionActivity(roomId, { ...guard, phase: 'voting' }, (activity) => (
    activity.declaringGuess ? null : resolveWordImposterVote(activity)
  ));

  const handleDeclareGuess = () => withBusy(() => (
    transitionActivity(roomId, { ...guard, phase: ['describing', 'voting'] }, (activity) => {
      if (!canDeclareGuessFor(activity, user.id)) return null;
      return {
        declaringGuess: {
          uid: user.id,
          displayName: getPlayerByUid(user.id)?.displayName || user.displayName || 'An imposter'
        },
        pausedFromPhase: activity.phase
      };
    })
  ));

  const handleResolveDeclareGuess = (correct) => withBusy(() => (
    transitionActivity(roomId, guard, (activity) => resolveImposterGuess(activity, correct))
  ));

  const handlePlayAgain = () => withBusy(async () => {
    const started = await transitionActivity(roomId, { ...guard, phase: 'ended' }, (activity, latestRoom) => {
      // Same group minus anyone who has left the room, plus anyone new
      const players = participantsFromRoom(latestRoom);
      if (players.length < 3) throw new Error('Need at least 3 players in the room to play again.');
      return dealWordImposter(players, activity.rules || {}, activity);
    });
    if (!started) toast.info('The game was already restarted.');
  });

  const handleEndGame = () => withBusy(async () => {
    await endActivity(roomId);
    navigate(`/room/${roomId}`);
  });

  if (authLoading || roomLoading) return <GameLoading />;
  if (!user) return <Navigate to="/onboarding" replace state={{ redirectTo: `/room/${roomId}` }} />;
  if (roomError || !room || !gameState || gameState.phase === 'lobby') return <Navigate to={`/room/${roomId}`} replace />;

  const lastResult = gameState.lastResult;
  const lastResultPlayer = lastResult?.uid ? getPlayerByUid(lastResult.uid) : null;
  const renderLastResult = () => {
    if (!lastResult || gameState.phase !== 'describing') return null;
    let text = null;
    if (lastResult.type === 'tie') text = 'The vote was tied, so nobody was eliminated. New round!';
    if (lastResult.type === 'no-votes') text = 'Nobody voted, so nobody was eliminated. New round!';
    if (lastResult.type === 'eliminated') {
      text = `${lastResultPlayer?.displayName || 'A player'} was voted out. They ${lastResult.wasImposter ? 'WERE' : 'were NOT'} an imposter.`;
    }
    if (lastResult.type === 'wrong-guess') {
      text = `${lastResultPlayer?.displayName || 'An imposter'} guessed wrong and is out.`;
    }
    if (!text) return null;
    return (
      <div className="rounded-xl p-4 text-center mb-4" style={{ backgroundColor: '#1a2540', border: '1px solid #c9a84c66' }}>
        <p style={{ color: '#e8d9a8', fontFamily: "'Special Elite', monospace", fontSize: '13px' }}>{text}</p>
      </div>
    );
  };

  return (
    <GameShell roomId={roomId} isHost={isHost} gameName="Word Imposter" onEndGame={() => endActivity(roomId)}>
      {renderPhase()}
    </GameShell>
  );

  function renderPhase() {
  // === WORD REVEAL PHASE ===
  if (gameState.phase === 'word-reveal') {
    const isParticipant = Boolean(getPlayerByUid(user?.id));
    if (!isParticipant) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md rounded-xl p-6 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
            <p style={{ color: '#c8d0e0', fontFamily: "'Special Elite', monospace" }}>You&apos;re spectating this round.</p>
            <p className="mt-2" style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>Players are checking their secret words...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center">
            {!showWord ? (
              <div className="bg-white rounded-lg p-8" style={{ backgroundColor: '#1e2a3a', border: '1px solid #2a3a5a' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-6" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Eyes Only</p>
                <div className="flex items-center justify-center mb-6">
                  <div style={{ width: '52px', height: '52px', borderRadius: '50%', border: '3px dashed #999', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: "'Special Elite', monospace", fontSize: '11px', color: '#999', textAlign: 'center', fontWeight: 'bold' }}>TOP<br/>SECRET</span>
                  </div>
                </div>
                <p style={{ fontFamily: "'Special Elite', monospace", color: '#7a8aaa', fontSize: '14px', marginBottom: '8px' }}>Your word is sealed</p>
                <p style={{ color: '#aaa', fontSize: '12px', marginBottom: '16px' }}>Tap reveal when alone</p>
                <button
                  onClick={() => setShowWord(true)}
                  className="w-full font-bold py-3 rounded transition-colors"
                  style={{ backgroundColor: '#1a2540', color: '#4dd9ac', fontFamily: "'Special Elite', monospace" }}
                >
                  Reveal
                </button>
              </div>
            ) : isImposter && gameState.rules?.imposterNoWord ? (
              <div className="rounded-lg p-8 text-center" style={{ backgroundColor: '#1e2a3a', border: '1px solid #2a3a5a' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>You are</p>
                <h1 className="text-4xl font-black mb-4" style={{ fontFamily: "'Special Elite', monospace", color: '#c8d0e0' }}>IMPOSTER</h1>
                {showCategory && (
                  <p className="text-sm mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#7a8aaa' }}>Category: {gameState.category}</p>
                )}
                <p className="text-base mb-6" style={{ fontFamily: "'Permanent Marker', cursive", color: '#c9384c' }}>guess the word or blend in</p>
                <button
                  onClick={() => setShowWord(false)}
                  className="w-full font-bold py-3 rounded"
                  style={{ backgroundColor: '#1a1a2e22', border: '1px solid #2a3a5a', borderRadius: '4px', fontFamily: "'Special Elite', monospace", color: '#c8d0e0' }}
                >
                  Hide
                </button>
              </div>
            ) : (
              <div className="rounded-lg p-8" style={{ backgroundColor: '#1e2a3a', border: '1px solid #2a3a5a' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Your Word Is</p>
                <h1 className="font-black mb-2" style={{ fontFamily: "'Special Elite', cursive", fontSize: '2rem', color: '#c8d0e0' }}>
                  {isImposter
                    ? (gameState.imposterWordsByUid?.[user?.id] || gameState.imposterWord)
                    : gameState.word}
                </h1>
                {showCategory ? (
                  <p className="text-sm mb-6" style={{ fontFamily: "'Special Elite', monospace", color: '#7a8aaa' }}>Category: {gameState.category}</p>
                ) : (
                  <div className="mb-6" />
                )}
                <button
                  onClick={() => setShowWord(false)}
                  className="w-full font-bold py-3 rounded"
                  style={{ backgroundColor: '#1a1a2e22', border: '1px solid #1a1a2e33', borderRadius: '4px', fontFamily: "'Special Elite', monospace", color: '#c8d0e0' }}
                >
                  Hide
                </button>
              </div>
            )}
          </div>

          <div className="mt-6">
            {isHost ? (
              <button
                onClick={handleStartDescribing}
                disabled={busy}
                className="w-full font-bold py-4 rounded-xl transition-colors"
                style={{ backgroundColor: '#e8e4dc', color: '#1a1a2e', fontFamily: "'Special Elite', monospace", border: 'none' }}
              >
                Start Describing
              </button>
            ) : (
              <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
                <p style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>Waiting for host to start</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // === DESCRIBING PHASE ===
  if (gameState.phase === 'describing') {
    const startingPlayer = getPlayerByUid(gameState.startingPlayerId);
    const directionText = gameState.direction === 'clockwise' ? 'clockwise' : 'anticlockwise';
    const showCountdown = countdown !== null && countdown > 0;
    const readyVotes = (gameState.readyVotes || []).filter((uid) => activePlayerUids.includes(uid));

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center">
            {renderLastResult()}
            {isCurrentPlayerEliminated && (
              <div className="rounded-xl p-4 text-center mb-3" style={{ backgroundColor: '#6a1e1e', border: '1px solid #9d2a2a' }}>
                <p style={{ color: '#ffb0b0', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>You have been eliminated</p>
              </div>
            )}

            <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Order of Play</p>
              <div className="mb-3" style={{ display: 'inline-block', backgroundColor: '#4dd9ac22', border: '1px solid #4dd9ac55', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', color: '#4dd9ac', fontFamily: "'Special Elite', monospace" }}>
                {directionText}
              </div>
              <div className="flex items-center justify-center gap-3 mb-2">
                {(() => {
                  const playerPhoto = getPlayerPhoto(startingPlayer);
                  return playerPhoto ? (
                    <img src={playerPhoto} alt={startingPlayer?.displayName} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className={`w-8 h-8 ${startingPlayer?.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-xs`}>
                      {getInitials(startingPlayer?.displayName)}
                    </div>
                  );
                })()}
                <h2 className="text-white font-bold" style={{ fontSize: '15px' }}>
                  {startingPlayer?.displayName || 'Unknown'}
                </h2>
              </div>
              {showCountdown && (
                <div className="text-white text-5xl font-black mt-3 animate-pulse">{countdown}</div>
              )}
              {!showCountdown && (
                <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '12px' }}>Describe the word — one clue each</p>
              )}
            </div>

            <button
              onClick={handleReadyToVote}
              disabled={readyClicked || isCurrentPlayerEliminated || isGuessPaused || !activePlayerUids.includes(user?.id)}
              className="w-full font-bold py-4 rounded-xl transition-colors mb-3"
              style={{
                backgroundColor: (readyClicked || isCurrentPlayerEliminated || isGuessPaused) ? '#1a2540' : '#e8e4dc',
                color: (readyClicked || isCurrentPlayerEliminated || isGuessPaused) ? '#8899bb' : '#1a1a2e',
                fontFamily: "'Special Elite', monospace",
                border: 'none',
                opacity: (readyClicked || isCurrentPlayerEliminated || isGuessPaused) ? 0.7 : 1
              }}
            >
              {!getPlayerByUid(user?.id) ? 'Spectating' : isCurrentPlayerEliminated ? 'Eliminated' : readyClicked ? 'Ready ✅' : 'Ready to Vote'}
            </button>

            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px', marginBottom: '12px' }}>
                Ready: {readyVotes.length}/{activePlayers.length}
              </p>
              <div className="flex items-center justify-center">
                {activePlayers.map((player, index) => {
                  const isReady = readyVotes.includes(player.uid);
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
                onClick={handleStartVotingNow}
                disabled={isGuessPaused || busy}
                className="w-full mt-3 font-bold py-4 rounded-xl transition-colors"
                style={{
                  backgroundColor: isGuessPaused ? '#1a2540' : '#e8e4dc',
                  color: isGuessPaused ? '#8899bb' : '#1a1a2e',
                  fontFamily: "'Special Elite', monospace",
                  border: isGuessPaused ? '1px solid #2a3a5a' : 'none'
                }}
              >
                Start Voting
              </button>
            )}

            {guessSystemEnabled && isActiveImposter && (
              <button
                onClick={handleDeclareGuess}
                disabled={!canDeclareGuess || busy}
                className="w-full mt-3 font-bold py-4 rounded-xl transition-colors"
                style={{
                  backgroundColor: canDeclareGuess ? '#6a1e1e' : '#1a2540',
                  color: canDeclareGuess ? '#ffb0b0' : '#8899bb',
                  fontFamily: "'Special Elite', monospace",
                  border: canDeclareGuess ? '1px solid #9d2a2a' : '1px solid #2a3a5a'
                }}
              >
                Declare Guess
              </button>
            )}
          </div>
        </div>

        {guessSystemEnabled && isGuessPaused && (
          <div className="absolute inset-0 flex items-center justify-center p-6" style={{ backgroundColor: '#0b1220dd' }}>
            <div className="w-full max-w-md rounded-xl p-6" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p className="text-white font-bold text-center mb-2" style={{ fontSize: '16px' }}>
                {declaringGuess?.displayName || 'An imposter'} is about to guess the town word
              </p>
              <p className="text-center mb-4" style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>Listen carefully...</p>

              {isHost ? (
                <div className="flex gap-3">
                  <button
                    disabled={busy}
                    onClick={() => handleResolveDeclareGuess(true)}
                    className="flex-1 font-bold py-3 rounded transition-colors"
                    style={{ backgroundColor: '#1e6a40', border: '1px solid #2a9d60', color: '#7effc4', fontFamily: "'Special Elite', monospace" }}
                  >
                    Correct
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleResolveDeclareGuess(false)}
                    className="flex-1 font-bold py-3 rounded transition-colors"
                    style={{ backgroundColor: '#6a1e1e', border: '1px solid #9d2a2a', color: '#ffb0b0', fontFamily: "'Special Elite', monospace" }}
                  >
                    Incorrect
                  </button>
                </div>
              ) : (
                <div className="rounded-lg p-3 text-center" style={{ backgroundColor: '#12192e' }}>
                  <p style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>Waiting for host confirmation...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // === VOTING PHASE ===
  if (gameState.phase === 'voting') {
    const votes = Object.entries(gameState.votes || {}).reduce((acc, [voterUid, targetUid]) => {
      if (activePlayerUids.includes(voterUid) && activePlayerUids.includes(targetUid)) {
        acc[voterUid] = targetUid;
      }
      return acc;
    }, {});
    const totalVoters = activePlayers.length;
    const votedCount = Object.keys(votes).length;

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 pt-16">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {isCurrentPlayerEliminated && (
              <div className="rounded-xl p-4 text-center mb-4" style={{ backgroundColor: '#6a1e1e', border: '1px solid #9d2a2a' }}>
                <p style={{ color: '#ffb0b0', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>You have been eliminated</p>
              </div>
            )}

            <h1 className="text-white text-2xl font-black mb-2">Who is the Imposter?</h1>
            <p className="text-slate-400 text-sm">
              Votes: {votedCount}/{totalVoters}
            </p>
          </div>

          <div style={isGuessPaused ? { pointerEvents: 'none', opacity: 0.55 } : undefined}>
            <VotingPanel
              players={activePlayers}
              requiredVoterUids={activePlayerUids.filter((uid) => presentUids.includes(uid))}
              votes={votes}
              currentUid={user?.id}
              isHost={isHost}
              fallbackRank={fallbackRank}
              onVote={handleConfirmVote}
              onEndVoting={handleEndVoting}
              theme="ballot"
            />
          </div>

          {guessSystemEnabled && isActiveImposter && (
            <button
              onClick={handleDeclareGuess}
              disabled={!canDeclareGuess}
              className="w-full mt-3 font-bold py-4 rounded-xl transition-colors"
              style={{
                backgroundColor: canDeclareGuess ? '#6a1e1e' : '#1a2540',
                color: canDeclareGuess ? '#ffb0b0' : '#8899bb',
                fontFamily: "'Special Elite', monospace",
                border: canDeclareGuess ? '1px solid #9d2a2a' : '1px solid #2a3a5a'
              }}
            >
              Declare Guess
            </button>
          )}
        </div>

        {guessSystemEnabled && isGuessPaused && (
          <div className="absolute inset-0 flex items-center justify-center p-6" style={{ backgroundColor: '#0b1220dd' }}>
            <div className="w-full max-w-md rounded-xl p-6" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p className="text-white font-bold text-center mb-2" style={{ fontSize: '16px' }}>
                {declaringGuess?.displayName || 'An imposter'} is about to guess the town word
              </p>
              <p className="text-center mb-4" style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>Listen carefully...</p>

              {isHost ? (
                <div className="flex gap-3">
                  <button
                    disabled={busy}
                    onClick={() => handleResolveDeclareGuess(true)}
                    className="flex-1 font-bold py-3 rounded transition-colors"
                    style={{ backgroundColor: '#1e6a40', border: '1px solid #2a9d60', color: '#7effc4', fontFamily: "'Special Elite', monospace" }}
                  >
                    Correct
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => handleResolveDeclareGuess(false)}
                    className="flex-1 font-bold py-3 rounded transition-colors"
                    style={{ backgroundColor: '#6a1e1e', border: '1px solid #9d2a2a', color: '#ffb0b0', fontFamily: "'Special Elite', monospace" }}
                  >
                    Incorrect
                  </button>
                </div>
              ) : (
                <div className="rounded-lg p-3 text-center" style={{ backgroundColor: '#12192e' }}>
                  <p style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px' }}>Waiting for host confirmation...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // === ENDED PHASE ===
  if (gameState.phase === 'ended') {
    const winner = gameState.winner;
    const imposterWon = winner === 'imposter';
    const isImposterNoWordMode = Boolean(gameState.rules?.imposterNoWord);
    const caseClosedStampColor = imposterWon ? '#8b3a3a' : '#5a7a9a';
    const roundsPlayed = gameState.roundNumber || 1;
    const agentLabel = getWinningAgentLabel(gameState);
    const imposterWordsByUid = gameState.imposterWordsByUid || {};
    const imposterWordsSummary = (() => {
      const wordsFromMap = Array.from(new Set(Object.values(imposterWordsByUid).filter(Boolean)));
      if (wordsFromMap.length > 0) return wordsFromMap.join(', ');
      return gameState.imposterWord ? gameState.imposterWord : '—';
    })();

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 flex items-center justify-center overflow-y-auto">
        <div className="w-full max-w-md py-6">
          {/* Typed Memo Header */}
          <div className="mb-6" style={{ fontFamily: "'Special Elite', monospace" }}>
            <div style={{ borderTop: '1px solid #8899bb66', marginBottom: '12px' }} />
            <div className="space-y-2 text-left">
              <p>
                <span className="uppercase tracking-widest" style={{ color: '#8899bb' }}>WINNER:</span>
                <span className="ml-3" style={{ color: '#d7deeb' }}>{winner === 'town' ? 'Town' : 'Imposter'}</span>
              </p>

              {imposterWon && (((!gameState.rules?.imposterNoWord && agentLabel) || gameState.winningAgent)) && (
                <p>
                  <span className="uppercase tracking-widest" style={{ color: '#8899bb' }}>AGENT:</span>
                  <span className="ml-3" style={{ color: '#d7deeb' }}>{!gameState.rules?.imposterNoWord ? agentLabel : gameState.winningAgent}</span>
                </p>
              )}

              <p>
                <span className="uppercase tracking-widest" style={{ color: '#8899bb' }}>ROUNDS:</span>
                <span className="ml-3" style={{ color: '#d7deeb' }}>
                  {roundsPlayed}
                </span>
              </p>
            </div>
            <div style={{ borderTop: '1px solid #8899bb66', marginTop: '12px' }} />
            <p className="italic mt-2" style={{ color: '#9facc5', fontSize: '11px' }}>
              {imposterWon
                ? 'This report is classified - filed by the Imposter Division'
                : 'Justice served - filed by the Village Council'}
            </p>
          </div>

          {/* Word Reveal - Envelope Style */}
          <div className={`${isImposterNoWordMode ? 'flex justify-center mb-6' : 'grid grid-cols-2 gap-4 mb-6'}`}>
            <div className="word-envelope-wrap" style={isImposterNoWordMode ? { width: '60%', maxWidth: '280px' } : undefined}>
              <div className="word-envelope-back" />

              <div className="word-envelope-letter text-center">
                <div style={{ height: '1px', background: '#c9a84c33', marginBottom: '8px' }} />
                <div style={{ height: '1px', background: '#c9a84c2a', marginBottom: '8px' }} />
                <div style={{ height: '1px', background: '#c9a84c20', marginBottom: '10px' }} />
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#7a6a4a', letterSpacing: '0.15em' }}>Town Word</p>
                <p style={{ fontFamily: "'Special Elite', monospace", fontSize: getWordFontSize(gameState.word), color: '#c9a84c', whiteSpace: 'normal', wordBreak: 'break-word' }}>{gameState.word}</p>
              </div>

              <div className="word-envelope-front" style={{ borderBottom: '3px solid #c9a84c', borderLeft: '3px solid #c9a84c', borderRight: '3px solid #c9a84c' }} />
            </div>

            {!isImposterNoWordMode && (
              <div className="word-envelope-wrap">
                <div className="word-envelope-back" />

                <div className="word-envelope-letter text-center">
                  <div style={{ height: '1px', background: '#c9384c33', marginBottom: '8px' }} />
                  <div style={{ height: '1px', background: '#c9384c2a', marginBottom: '8px' }} />
                  <div style={{ height: '1px', background: '#c9384c20', marginBottom: '10px' }} />
                  <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#7a6a4a', letterSpacing: '0.15em' }}>Imposter Word</p>
                  <p style={{ fontFamily: "'Special Elite', monospace", fontSize: getWordFontSize(imposterWordsSummary), color: '#8a2020', whiteSpace: 'normal', wordBreak: 'break-word' }}>{imposterWordsSummary}</p>
                </div>

                <div className="word-envelope-front" style={{ borderBottom: '3px solid #c9384c', borderLeft: '3px solid #c9384c', borderRight: '3px solid #c9384c' }} />
              </div>
            )}
          </div>

          {/* Agents Assigned - Mafia Case Closed Style */}
          <div className="relative overflow-hidden rounded-xl p-5 mb-6 text-left shadow-lg" style={{ backgroundColor: '#d4b483', border: '1px solid #8b6b3f' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono font-bold uppercase tracking-widest text-sm" style={{ color: '#3a2a1a' }}>
                CASE:
              </span>
              <span
                className="border-2 rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-widest opacity-80"
                style={{
                  borderColor: caseClosedStampColor,
                  color: caseClosedStampColor,
                  transform: 'rotate(-6deg)',
                  fontSize: '10px',
                  fontFamily: "'Courier Prime', monospace"
                }}
              >
                CLOSED
              </span>
            </div>

            <div style={{ height: '1px', backgroundColor: '#4a3622', marginBottom: '16px', opacity: '0.45' }} />

            <div style={{ backgroundColor: '#eadfca', border: '1px solid #8b6b3f', borderRadius: '8px', padding: '16px' }}>
              <p className="text-[#3a2a1a] text-[11px] font-mono uppercase tracking-widest mb-3">AGENTS ASSIGNED: {gameState.players?.length || 0}</p>
              <div className="border-t border-[#8b6b3f]/40 mb-3" />
              <div>
                {gameState.players.map((player, idx) => {
                  const wasImposter = gameState.imposterIds?.includes(player.uid);
                  const playerPhoto = getPlayerPhoto(player);
                  const eliminatedRound = gameState.eliminatedRounds?.[player.uid];
                  const survivedRounds = Number.isInteger(eliminatedRound)
                    ? Math.min(roundsPlayed, eliminatedRound)
                    : roundsPlayed;
                  const roundsLabel = `Rounds: ${survivedRounds}`;
                  const roundsColor = wasImposter ? '#8b3a3a' : '#5a7a9a';

                  return (
                    <div key={player.uid}>
                      <div
                        className="relative flex items-center justify-between py-3"
                        style={{
                          backgroundColor: idx % 2 === 0 ? 'transparent' : '#f3ead8/40'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {playerPhoto ? (
                            <img src={playerPhoto} alt={player.displayName} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className={`w-8 h-8 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-xs`}>
                              {getInitials(player.displayName)}
                            </div>
                          )}
                          <span className="font-mono font-semibold uppercase" style={{ color: '#2f2418', fontSize: '14px' }}>
                            {player.displayName}
                            <span style={{ marginLeft: '8px', fontSize: '12px', fontFamily: 'monospace', color: roundsColor }}>
                              {roundsLabel}
                            </span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {wasImposter && (
                            <span
                              className="border-2 rounded-sm px-2 py-0.5 text-xs font-bold uppercase tracking-widest opacity-80"
                              style={{
                                borderColor: '#8b3a3a',
                                color: '#8b3a3a',
                                transform: 'rotate(6deg)',
                                fontSize: '10px',
                                fontFamily: "'Courier Prime', monospace"
                              }}
                            >
                              IMPOSTER
                            </span>
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

          {isHost ? (
            <div className="space-y-3">
              <button
                onClick={handlePlayAgain}
                disabled={busy}
                className="w-full font-bold py-4 rounded-xl transition-colors"
                style={{ backgroundColor: '#e8e4dc', color: '#1a1a2e', fontFamily: "'Special Elite', monospace", border: 'none' }}
              >
                Play Again
              </button>
              <button
                onClick={handleEndGame}
                disabled={busy}
                className="w-full font-bold py-4 rounded-xl transition-colors"
                style={{ backgroundColor: '#1a2540', color: '#8899bb', fontFamily: "'Special Elite', monospace", border: '1px solid #2a3a5a' }}
              >
                End Game
              </button>
            </div>
          ) : (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '12px' }}>Thanks for playing! Waiting for the host to play again or end the game.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}

}
