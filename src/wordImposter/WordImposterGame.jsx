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

    if (isEliminatedImposter) {
      // Town wins immediately
      await updateDoc(roomRef, {
        'activeActivity.eliminatedUid': eliminated,
        'activeActivity.phase': 'ended',
        'activeActivity.winner': 'town',
        lastActivity: serverTimestamp()
      });
    } else {
      // Imposter wins immediately, then optional guess phase for fun
      await updateDoc(roomRef, {
        'activeActivity.eliminatedUid': eliminated,
        'activeActivity.phase': 'imposter-guess',
        'activeActivity.winner': 'imposter',
        'activeActivity.wordRevealed': false,
        lastActivity: serverTimestamp()
      });
    }
  };

  const handleImposterGuessResult = async () => {
    if (!isHost) return;

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'ended',
      'activeActivity.winner': gameState?.winner || 'imposter',
      'activeActivity.wordRevealed': false,
      lastActivity: serverTimestamp()
    });
  };

  const handleRevealWord = async () => {
    if (!isHost) return;

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.wordRevealed': true,
      lastActivity: serverTimestamp()
    });
  };

  const handlePlayAgain = async () => {
    if (!isHost) return;

    const roomRef = doc(db, 'rooms', roomId);

    // Pick new random word
    const { word, category } = getRandomWord();

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
              <div>
                <div className="text-6xl mb-6">🤫</div>
                <h1 className="text-white text-2xl font-bold mb-4">Your word is hidden</h1>
                <p className="text-slate-400 mb-8">Tap Reveal to see your card</p>
                <button
                  onClick={() => setShowWord(true)}
                  className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold py-4 rounded-xl transition-colors"
                >
                  Reveal
                </button>
              </div>
            ) : isImposter ? (
              <div className="bg-gradient-to-br from-red-900 to-red-800 border-2 border-red-600/50 rounded-2xl p-8 text-center">
                <div className="text-8xl mb-6">🕵️</div>
                <h1 className="text-white text-3xl font-black mb-4">You are the IMPOSTER 🕵️</h1>
                {gameState.rules?.showCategory && gameState.category && (
                  <div className="bg-red-800/60 border border-red-600/40 rounded-xl p-4 mt-4">
                    <p className="text-red-200 text-sm mb-1">Category</p>
                    <p className="text-white text-xl font-bold">{gameState.category}</p>
                  </div>
                )}
                <p className="text-red-200 mt-6 text-sm">Listen carefully and try to blend in!</p>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-teal-900 to-cyan-900 border-2 border-teal-500/30 rounded-2xl p-8">
                <p className="text-teal-200 text-sm mb-2">Your word is:</p>
                <h1 className="text-white text-4xl font-black mb-2">{gameState.word}</h1>
                <p className="text-teal-300 text-sm mb-6">Category: {gameState.category}</p>
                <button
                  onClick={() => setShowWord(false)}
                  className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl transition-colors"
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
                className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Start Describing 🗣️
              </button>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
                <p className="text-slate-300">Waiting for host to start describing...</p>
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
    const directionText = gameState.direction === 'clockwise' ? 'Going clockwise ➡️' : 'Going anticlockwise ⬅️';
    const showCountdown = countdown !== null && countdown > 0;
    const readyVotes = gameState.readyVotes || [];

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center">
            {showCountdown ? (
              <>
                <div className="bg-teal-900/50 border border-teal-700 rounded-2xl p-8 mb-6">
                  <div className="text-4xl mb-4">🗣️</div>
                  <h2 className="text-white text-xl font-bold mb-2">
                    {startingPlayer?.displayName} is going first!
                  </h2>
                  <p className="text-teal-300 text-lg mb-6">{directionText}</p>
                  <div className="text-white text-7xl font-black animate-pulse">{countdown}</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-teal-900/50 border border-teal-700 rounded-2xl p-8 mb-6">
                  <div className="text-4xl mb-4">🗣️</div>
                  <h2 className="text-white text-xl font-bold mb-2">
                    {startingPlayer?.displayName} is going first!
                  </h2>
                  <p className="text-teal-300 text-lg mb-4">{directionText}</p>
                  <p className="text-slate-300 text-sm">Describe the word now</p>
                </div>
              </>
            )}

            <button
              onClick={handleReadyToVote}
              disabled={readyClicked}
              className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:from-slate-700 disabled:to-slate-700 text-white disabled:text-slate-300 font-bold py-4 rounded-xl transition-colors"
            >
              {readyClicked ? "You're ready ✅" : 'Ready to Vote ✋'}
            </button>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center mt-3">
              <p className="text-slate-300 text-sm">
                Ready: {readyVotes.length}/{(gameState.players ?? []).length}
              </p>
              <div className="flex items-center justify-center mt-3">
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
                className="w-full mt-3 bg-white hover:bg-slate-200 text-slate-900 font-bold py-4 rounded-xl transition-colors"
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
            <h1 className="text-white text-2xl font-black mb-2">Who is the Imposter? 🕵️</h1>
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
          />
        </div>
      </div>
    );
  }

  // === IMPOSTER GUESS PHASE ===
  if (gameState.phase === 'imposter-guess') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-8xl mb-4">🕵️</div>
            <h1 className="text-white text-3xl font-black mb-2">
              The imposter wins! But can they guess the word?
            </h1>
            <p className="text-slate-300 text-lg">The imposter says their guess out loud.</p>
          </div>

          <div className="bg-teal-900/50 border border-teal-700 rounded-2xl p-6 text-center mb-6">
            <p className="text-teal-200 text-lg font-semibold">
              Imposter — can you guess the word? Say it out loud!
            </p>
          </div>

          {isHost ? (
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6">
              <p className="text-white font-semibold text-center mb-4">
                Did the imposter guess the word correctly?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleImposterGuessResult(true)}
                  className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition-colors"
                >
                  Correct
                </button>
                <button
                  onClick={() => handleImposterGuessResult(false)}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-4 rounded-xl transition-colors"
                >
                  Incorrect
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
              <p className="text-slate-300">Waiting for host to confirm the imposter's guess...</p>
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
    const eliminatedPlayer = getPlayerByUid(gameState.eliminatedUid);
    const isWordHidden = gameState.wordRevealed === false;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="text-8xl mb-4">{winner === 'town' ? '🎉' : '🕵️'}</div>
            <h1 className="text-white text-4xl font-black mb-2">
              {winner === 'town' ? 'Town wins!' : 'Imposter wins!'}
            </h1>
            {winner === 'town' && eliminatedPlayer && gameState.imposterIds?.includes(eliminatedPlayer.uid) && (
              <p className="text-green-400 text-lg">The imposter was voted out!</p>
            )}
            {winner === 'imposter' && eliminatedPlayer && !gameState.imposterIds?.includes(eliminatedPlayer.uid) && (
              <p className="text-red-400 text-lg">An innocent player was voted out!</p>
            )}
          </div>

          {/* Reveal the word */}
          {isWordHidden ? (
            <div className="bg-teal-900/50 border border-teal-700 rounded-2xl p-6 text-center mb-6">
              <p className="text-teal-200 text-sm mb-1">Word</p>
              <h2 className="text-white text-3xl font-black">Word hidden</h2>
              {isHost && (
                <button
                  onClick={handleRevealWord}
                  className="w-full mt-4 bg-white hover:bg-slate-200 text-slate-900 font-bold py-3 rounded-xl transition-colors"
                >
                  Reveal Word
                </button>
              )}
            </div>
          ) : (
            <div className="bg-teal-900/50 border border-teal-700 rounded-2xl p-6 text-center mb-6">
              <p className="text-teal-200 text-sm mb-1">The word was</p>
              <h2 className="text-white text-3xl font-black">{gameState.word}</h2>
              <p className="text-teal-300 text-sm mt-1">Category: {gameState.category}</p>
            </div>
          )}

          {/* Reveal imposters */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 mb-6">
            <h3 className="text-white font-semibold mb-4">
              {imposterPlayers.length === 1 ? 'The Imposter was' : 'The Imposters were'}
            </h3>
            <div className="space-y-3">
              {gameState.players.map((player) => {
                const wasImposter = gameState.imposterIds?.includes(player.uid);
                const playerPhoto = getPlayerPhoto(player);
                return (
                  <div
                    key={player.uid}
                    className={`flex items-center justify-between rounded-lg p-3 ${
                      wasImposter ? 'bg-red-900/30' : 'bg-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {playerPhoto ? (
                        <img src={playerPhoto} alt={player.displayName} className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                          {getInitials(player.displayName)}
                        </div>
                      )}
                      <span className="text-white">{player.displayName}</span>
                    </div>
                    {wasImposter ? (
                      <span className="text-sm font-semibold uppercase text-red-400">
                        IMPOSTER
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {isHost ? (
            <div className="space-y-3">
              <button
                onClick={handlePlayAgain}
                className="w-full bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold py-4 rounded-xl transition-colors"
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
              <p className="text-slate-300">Thanks for playing!</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
