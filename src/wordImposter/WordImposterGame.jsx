import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials } from '../utils/avatar';
import { getRandomWord } from './words';
import VotingPanel from '../components/VotingPanel';

export default function WordImposterGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading } = useRoom(roomId, user?.id, user?.displayName, user?.photo || null);

  const [gameState, setGameState] = useState(null);
  const [gameStateLoaded, setGameStateLoaded] = useState(false);
  const [showWord, setShowWord] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [readyClicked, setReadyClicked] = useState(false);
  const [guessConfirmed, setGuessConfirmed] = useState(false);
  const countdownRef = useRef(null);

  // Subscribe to game state via onSnapshot
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.activeActivity && data.activeActivity.type === 'wordImposter') {
          setGameState(data.activeActivity);
          setGameStateLoaded(true);
        } else {
          setGameState(null);
        }
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // Reset vote state on phase change
  useEffect(() => {
    if (gameState) {
      setReadyClicked(gameState.readyVotes?.includes(user?.id) || false);
    }
  }, [gameState?.phase]);

  useEffect(() => {
    if (gameState?.phase === 'word-reveal') {
      setShowWord(false);
    }
    if (gameState?.phase === 'imposter-guess') {
      setGuessConfirmed(false);
    }
  }, [gameState?.phase]);

  // Describing phase countdown
  useEffect(() => {
    if (gameState?.phase !== 'describing') {
      setCountdown(null);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    // Calculate countdown from phaseStartedAt
    const startedAt = gameState.phaseStartedAt?.toMillis
      ? gameState.phaseStartedAt.toMillis()
      : gameState.phaseStartedAt;

    if (!startedAt) return;

    const updateCountdown = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, Math.ceil((5000 - elapsed) / 1000));
      setCountdown(remaining);
    };

    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 200);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [gameState?.phase, gameState?.phaseStartedAt]);

  const isImposter = gameState?.imposterIds?.includes(user?.id);

  const getPlayerByUid = (uid) => {
    return gameState?.players?.find(p => p.uid === uid);
  };

  const getPlayerPhoto = (playerOrUid) => {
    const playerUid = typeof playerOrUid === 'string' ? playerOrUid : playerOrUid?.uid;
    if (!playerUid) return null;

    const activityPlayer = typeof playerOrUid === 'object'
      ? playerOrUid
      : getPlayerByUid(playerUid);

    const matchingRoomPlayer = room?.players?.find((player) => player.id === playerUid);
    return activityPlayer?.photo || activityPlayer?.photoURL || matchingRoomPlayer?.photo || null;
  };

  const getWordFontSize = (word) => {
    if (!word) return '1.6rem';
    const wordLength = word.length;
    if (wordLength <= 8) return '1.6rem';
    if (wordLength <= 12) return '1.2rem';
    if (wordLength <= 16) return '1rem';
    return '0.85rem';
  };

  // === HOST ACTIONS ===

  const handleStartDescribing = async () => {
    if (!isHost) return;
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'describing',
      'activeActivity.phaseStartedAt': Date.now(),
      'activeActivity.readyVotes': [],
      lastActivity: serverTimestamp()
    });
  };

  const handleReadyToVote = async () => {
    if (!user || readyClicked) return;
    setReadyClicked(true);

    const roomRef = doc(db, 'rooms', roomId);
    const currentReadyVotes = gameState.readyVotes || [];
    const updatedReadyVotes = [...new Set([...currentReadyVotes, user.id])];

    await updateDoc(roomRef, {
      'activeActivity.readyVotes': updatedReadyVotes,
      lastActivity: serverTimestamp()
    });
  };

  const startVotingPhase = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'voting',
      'activeActivity.votes': {},
      'activeActivity.eliminatedUid': null,
      lastActivity: serverTimestamp()
    });
  };

  const handleStartVotingNow = async () => {
    if (!isHost || !gameState || gameState.phase !== 'describing') return;
    await startVotingPhase();
  };

  // Host auto-advance when all players ready
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'describing') return;

    const readyVotes = gameState.readyVotes || [];
    const allPlayerUids = (gameState.players ?? []).map(p => p.uid);

    if (allPlayerUids.length > 0 && allPlayerUids.every(uid => readyVotes.includes(uid))) {
      startVotingPhase().catch(err => console.error('Error advancing to voting:', err));
    }
  }, [isHost, gameState?.phase, gameState?.readyVotes, gameState?.players]);

  const handleConfirmVote = async (targetUid) => {
    if (!user || !targetUid) {
      throw new Error('Vote unavailable');
    }

    if (targetUid === user.id) {
      throw new Error('You cannot vote for yourself');
    }

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      [`activeActivity.votes.${user.id}`]: targetUid,
      lastActivity: serverTimestamp()
    });
  };

  const handleEndVoting = async () => {
    if (!isHost || !gameState) return;

    const roomRef = doc(db, 'rooms', roomId);
    const votes = gameState.votes || {};

    // Count votes
    const voteCounts = {};
    Object.values(votes).forEach(targetUid => {
      voteCounts[targetUid] = (voteCounts[targetUid] || 0) + 1;
    });

    // Find most voted
    let maxVotes = 0;
    let candidates = [];
    Object.entries(voteCounts).forEach(([uid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        candidates = [uid];
      } else if (count === maxVotes) {
        candidates.push(uid);
      }
    });

    // Random tiebreak
    const eliminated = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : null;

    if (!eliminated) return;

    const isEliminatedImposter = (gameState.imposterIds ?? []).includes(eliminated);

    // Winner is decided by vote result only.
    // Non-imposter eliminated => imposter wins.
    // Imposter eliminated => town wins.
    await updateDoc(roomRef, {
      'activeActivity.eliminatedUid': eliminated,
      'activeActivity.phase': 'imposter-guess',
      'activeActivity.winner': isEliminatedImposter ? 'town' : 'imposter',
      'activeActivity.wordRevealed': true,
      lastActivity: serverTimestamp()
    });
  };

  const handleImposterGuessResult = async (_guessedCorrect) => {
    if (!isHost) return;

    setGuessConfirmed(true);

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'ended',
      // Guess confirmation is display-only and never changes winner.
      'activeActivity.winner': gameState?.winner || 'imposter',
      'activeActivity.wordRevealed': true,
      lastActivity: serverTimestamp()
    });
  };

  const handlePlayAgain = async () => {
    if (!isHost) return;

    const roomRef = doc(db, 'rooms', roomId);

    // Pick new random word
    const { word, related, category } = getRandomWord();

    // Reassign imposters randomly
    const players = [...gameState.players];
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const imposterCount = gameState.rules?.imposterCount || 1;
    const newImposterIds = shuffled.slice(0, imposterCount).map(p => p.uid);

    // Random starting player and direction
    const startingPlayer = players[Math.floor(Math.random() * players.length)];
    const direction = Math.random() < 0.5 ? 'clockwise' : 'anticlockwise';

    await updateDoc(roomRef, {
      'activeActivity.phase': 'word-reveal',
      'activeActivity.word': word,
      'activeActivity.imposterWord': gameState.rules?.imposterNoWord ? null : related,
      'activeActivity.category': category,
      'activeActivity.imposterIds': newImposterIds,
      'activeActivity.startingPlayerId': startingPlayer.uid,
      'activeActivity.direction': direction,
      'activeActivity.readyVotes': [],
      'activeActivity.votes': {},
      'activeActivity.eliminatedUid': null,
      'activeActivity.winner': null,
      'activeActivity.wordRevealed': null,
      'activeActivity.roundNumber': (gameState.roundNumber || 1) + 1,
      lastActivity: serverTimestamp()
    });
  };

  const handleEndGame = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp()
    });
    navigate(`/room/${roomId}`);
  };

  // === LOADING ===
  const isLoading = authLoading || roomLoading || !gameStateLoaded;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⌛</div>
          <div className="text-white text-xl">Loading game...</div>
          <p className="text-slate-400 text-sm mt-2">Please wait</p>
        </div>
      </div>
    );
  }

  // No active game - redirect
  if (!gameState) {
    navigate(`/room/${roomId}`);
    return null;
  }

  // Lobby phase - redirect to HomeScreen
  if (gameState.phase === 'lobby') {
    navigate(`/room/${roomId}`);
    return null;
  }

  // === WORD REVEAL PHASE ===
  if (gameState.phase === 'word-reveal') {
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
                <p className="text-base mb-6" style={{ fontFamily: "'Permanent Marker', cursive", color: '#c9384c' }}>No word to hide</p>
                <button
                  onClick={() => setShowWord(false)}
                  className="w-full font-bold py-3 rounded"
                  style={{ backgroundColor: '#1a1a2e22', border: '1px solid #1a1a2e33', borderRadius: '4px', fontFamily: "'Special Elite', monospace", color: '#1a1a2e' }}
                >
                  Hide
                </button>
              </div>
            ) : (
              <div className="rounded-lg p-8" style={{ backgroundColor: '#1e2a3a', border: '1px solid #2a3a5a' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Your Word Is</p>
                <h1 className="font-black mb-2" style={{ fontFamily: "'Special Elite', cursive", fontSize: '2rem', color: '#c8d0e0' }}>
                  {isImposter ? (gameState.imposterWord || gameState.word) : gameState.word}
                </h1>
                <p className="text-sm mb-6" style={{ fontFamily: "'Special Elite', monospace", color: '#7a8aaa' }}>Category: {gameState.category}</p>
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
    const readyVotes = gameState.readyVotes || [];

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center">
            <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Order of Play</p>
              <div className="mb-3" style={{ display: 'inline-block', backgroundColor: '#4dd9ac22', border: '1px solid #4dd9ac55', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', color: '#4dd9ac', fontFamily: "'Special Elite', monospace" }}>
                {directionText}
              </div>
              <div className="flex items-center gap-3 mb-2">
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
                  {startingPlayer?.displayName}
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
              disabled={readyClicked}
              className="w-full font-bold py-4 rounded-xl transition-colors mb-3"
              style={{
                backgroundColor: readyClicked ? '#1a2540' : '#e8e4dc',
                color: readyClicked ? '#8899bb' : '#1a1a2e',
                fontFamily: "'Special Elite', monospace",
                border: 'none',
                opacity: readyClicked ? 0.7 : 1
              }}
            >
              {readyClicked ? 'Ready ✅' : 'Ready to Vote'}
            </button>

            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p style={{ color: '#8899bb', fontFamily: "'Special Elite', monospace", fontSize: '12px', marginBottom: '12px' }}>
                Ready: {readyVotes.length}/{(gameState.players ?? []).length}
              </p>
              <div className="flex items-center justify-center">
                {(gameState.players ?? []).map((player, index) => {
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
                className="w-full mt-3 font-bold py-4 rounded-xl transition-colors"
                style={{ backgroundColor: '#e8e4dc', color: '#1a1a2e', fontFamily: "'Special Elite', monospace", border: 'none' }}
              >
                Start Voting
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // === VOTING PHASE ===
  if (gameState.phase === 'voting') {
    const votes = gameState.votes || {};
    const allPlayers = gameState.players || [];
    const totalVoters = allPlayers.length;
    const votedCount = Object.keys(votes).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-white text-2xl font-black mb-2">Who is the Imposter?</h1>
            <p className="text-slate-400 text-sm">
              Votes: {votedCount}/{totalVoters}
            </p>
          </div>

          <VotingPanel
            players={allPlayers}
            votes={votes}
            currentUid={user?.id}
            isHost={isHost}
            onVote={handleConfirmVote}
            onEndVoting={handleEndVoting}
            theme="ballot"
          />
        </div>
      </div>
    );
  }

  // === IMPOSTER GUESS PHASE ===
  if (gameState.phase === 'imposter-guess') {
    const imposterPlayers = (gameState.imposterIds || []).map(uid => getPlayerByUid(uid)).filter(Boolean);
    const primaryImposter = imposterPlayers[0];

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-md py-6">
          {/* Lineup Card */}
          <div className="rounded-lg p-6 mb-6 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Suspect Identified</p>
            <h2 className="font-bold mb-1" style={{ fontFamily: "'Special Elite', monospace", fontSize: '1.5rem', color: '#c8d0e0' }}>
              {primaryImposter?.displayName || 'The imposter'}
            </h2>
            <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '1.2rem', color: '#c9384c' }}>The Imposter</p>
          </div>

          {/* Evidence Board */}
          <div className="rounded-lg p-6 mb-6" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
            <div className="grid grid-cols-2 gap-4">
              {/* Town Word */}
              <div className="rounded p-4 text-center" style={{ backgroundColor: '#16202e', borderBottom: '2px solid #c9a84c', position: 'relative' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Town Word</p>
                {!guessConfirmed ? (
                  <>
                    <p style={{ fontFamily: "'Special Elite', cursive", fontSize: '1.8rem', color: '#9a9080', position: 'relative', zIndex: 10 }}>???</p>
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, #ccc5bb44 4px, #ccc5bb44 5px)',
                      borderRadius: '4px'
                    }}></div>
                  </>
                ) : (
                  <p style={{ fontFamily: "'Special Elite', cursive", fontSize: getWordFontSize(gameState.word), color: '#c8d0e0', whiteSpace: 'normal', wordBreak: 'break-word' }}>{gameState.word}</p>
                )}
              </div>
              {/* Imposter Word */}
              <div className="rounded p-4 text-center" style={{ backgroundColor: '#16202e', borderBottom: '2px solid #c9384c' }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', letterSpacing: '0.15em' }}>Imposter Word</p>
                <p style={{ fontFamily: "'Special Elite', cursive", fontSize: getWordFontSize(gameState.imposterWord), color: '#c9384c', whiteSpace: 'normal', wordBreak: 'break-word' }}>{gameState.imposterWord ? gameState.imposterWord : '—'}</p>
              </div>
            </div>
          </div>

          {/* Guess Prompt */}
          <div className="rounded-xl p-6 mb-6" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
            {isHost ? (
              <>
                <p className="text-white font-bold mb-2" style={{ fontSize: '14px' }}>Can {primaryImposter?.displayName || 'the imposter'} guess the town's word?</p>
                <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '11px' }}>Waiting for {primaryImposter?.displayName || 'the imposter'} to guess aloud...</p>
              </>
            ) : isImposter ? (
              <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '12px' }}>Say your guess out loud...</p>
            ) : (
              <div style={{ backgroundColor: '#12192e', padding: '12px', borderRadius: '8px' }}>
                <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '12px' }}>Waiting for host to confirm...</p>
              </div>
            )}
          </div>

          {/* Host Confirm Buttons */}
          {isHost && (
            <div className="rounded-xl p-6" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '10px', marginBottom: '12px', textAlign: 'center', letterSpacing: '0.15em' }}>DID THEY GET IT RIGHT?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleImposterGuessResult(true)}
                  className="flex-1 font-bold py-4 rounded transition-colors"
                  style={{
                    backgroundColor: '#1e6a40',
                    border: '1px solid #2a9d60',
                    color: '#7effc4',
                    fontFamily: "'Special Elite', monospace",
                    borderRadius: '8px'
                  }}
                >
                  Correct
                </button>
                <button
                  onClick={() => handleImposterGuessResult(false)}
                  className="flex-1 font-bold py-4 rounded transition-colors"
                  style={{
                    backgroundColor: '#6a1e1e',
                    border: '1px solid #9d2a2a',
                    color: '#ffb0b0',
                    fontFamily: "'Special Elite', monospace",
                    borderRadius: '8px'
                  }}
                >
                  Incorrect
                </button>
              </div>
            </div>
          )}
          {!isHost && (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '12px' }}>Waiting for host to confirm...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // === ENDED PHASE ===
  if (gameState.phase === 'ended') {
    const winner = gameState.winner;
    const imposterPlayers = (gameState.imposterIds || []).map(uid => getPlayerByUid(uid)).filter(Boolean);
    const imposterWon = winner === 'imposter';
    const caseClosedStampColor = imposterWon ? '#8b3a3a' : '#5a7a9a';
    const roundsPlayed = gameState.roundNumber || 1;
    const voteTargets = Object.values(gameState.votes || {});
    const imposterIds = gameState.imposterIds || [];
    const deceivedCount = imposterWon
      ? voteTargets.filter((targetUid) => !imposterIds.includes(targetUid)).length
      : voteTargets.filter((targetUid) => imposterIds.includes(targetUid)).length;

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

              {imposterWon && (
                <p>
                  <span className="uppercase tracking-widest" style={{ color: '#8899bb' }}>AGENT:</span>
                  <span className="ml-3" style={{ color: '#d7deeb' }}>{imposterPlayers[0]?.displayName || 'Unknown'}</span>
                </p>
              )}

              {winner === 'town' && (
                <p>
                  <span className="uppercase tracking-widest" style={{ color: '#8899bb' }}>STATUS:</span>
                  <span className="ml-3" style={{ color: '#d7deeb' }}>Imposter correctly identified</span>
                </p>
              )}

              <p>
                <span className="uppercase tracking-widest" style={{ color: '#8899bb' }}>ROUNDS:</span>
                <span className="ml-3" style={{ color: '#d7deeb' }}>
                  {roundsPlayed}
                </span>
              </p>

              <p>
                <span className="uppercase tracking-widest" style={{ color: '#8899bb' }}>DECEIVED:</span>
                <span className="ml-3" style={{ color: '#d7deeb' }}>
                  {deceivedCount}
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
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="word-envelope-wrap">
              <div className="word-envelope-back" />

              <div className="word-envelope-letter text-center">
                <div style={{ height: '1px', background: '#c9a84c33', marginBottom: '8px' }} />
                <div style={{ height: '1px', background: '#c9a84c2a', marginBottom: '8px' }} />
                <div style={{ height: '1px', background: '#c9a84c20', marginBottom: '10px' }} />
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#7a6a4a', letterSpacing: '0.15em' }}>Town Word</p>
                <p style={{ fontFamily: "'Special Elite', monospace", fontSize: getWordFontSize(gameState.word), color: '#1a1a2e', whiteSpace: 'normal', wordBreak: 'break-word' }}>{gameState.word}</p>
              </div>

              <div className="word-envelope-front" style={{ borderBottom: '3px solid #c9a84c' }} />
            </div>

            <div className="word-envelope-wrap">
              <div className="word-envelope-back" />

              <div className="word-envelope-letter text-center">
                <div style={{ height: '1px', background: '#c9384c33', marginBottom: '8px' }} />
                <div style={{ height: '1px', background: '#c9384c2a', marginBottom: '8px' }} />
                <div style={{ height: '1px', background: '#c9384c20', marginBottom: '10px' }} />
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ fontFamily: "'Special Elite', monospace", color: '#7a6a4a', letterSpacing: '0.15em' }}>Imposter Word</p>
                <p style={{ fontFamily: "'Special Elite', monospace", fontSize: getWordFontSize(gameState.imposterWord), color: '#8a2020', whiteSpace: 'normal', wordBreak: 'break-word' }}>{gameState.imposterWord ? gameState.imposterWord : '—'}</p>
              </div>

              <div className="word-envelope-front" style={{ borderBottom: '3px solid #c9384c' }} />
            </div>
          </div>

          {/* Agents Assigned - Mafia Case Closed Style */}
          <div className="relative overflow-hidden rounded-xl p-5 mb-6 text-left shadow-lg" style={{ backgroundColor: '#d4b483', border: '1px solid #8b6b3f' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: '#3a2a1a' }}>
                CASE:
              </span>
              <span
                className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
                style={{
                  borderColor: caseClosedStampColor,
                  color: caseClosedStampColor,
                  transform: 'rotate(-6deg)',
                  fontSize: '10px'
                }}
              >
                CLOSED
              </span>
            </div>

            <div style={{ height: '1px', backgroundColor: '#4a3622', marginBottom: '16px', opacity: '0.45' }} />

            <div style={{ backgroundColor: '#eadfca', border: '1px solid #8b6b3f', borderRadius: '8px', padding: '16px' }}>
              <div>
                {gameState.players.map((player, idx) => {
                  const wasImposter = gameState.imposterIds?.includes(player.uid);
                  const playerPhoto = getPlayerPhoto(player);

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
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {wasImposter && (
                            <span
                              className="border-2 px-2 py-0.5 text-xs font-black uppercase tracking-widest"
                              style={{
                                borderColor: '#8b3a3a',
                                color: '#8b3a3a',
                                transform: 'rotate(6deg)',
                                fontSize: '10px'
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
                className="w-full font-bold py-4 rounded-xl transition-colors"
                style={{ backgroundColor: '#e8e4dc', color: '#1a1a2e', fontFamily: "'Special Elite', monospace", border: 'none' }}
              >
                Play Again
              </button>
              <button
                onClick={handleEndGame}
                className="w-full font-bold py-4 rounded-xl transition-colors"
                style={{ backgroundColor: '#1a2540', color: '#8899bb', fontFamily: "'Special Elite', monospace", border: '1px solid #2a3a5a' }}
              >
                End Game
              </button>
            </div>
          ) : (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#1a2540', border: '1px solid #2a3a5a' }}>
              <p style={{ fontFamily: "'Special Elite', monospace", color: '#8899bb', fontSize: '12px' }}>Thanks for playing!</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
