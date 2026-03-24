import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials } from '../utils/avatar';
import WORD_LIST, { getRandomWord } from './words';
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
  }, [gameState?.phase, gameState?.readyVotes, user?.id]);

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
  const isImposterNoWordMode = Boolean(gameState?.rules?.imposterNoWord);
  const guessSystemEnabled = isImposterNoWordMode;
  const eliminatedPlayers = Array.isArray(gameState?.eliminatedPlayers)
    ? gameState.eliminatedPlayers
    : [];
  const activePlayers = (gameState?.players || []).filter((player) => !eliminatedPlayers.includes(player.uid));
  const activePlayerUids = activePlayers.map((player) => player.uid);
  const declaringGuess = guessSystemEnabled ? (gameState?.declaringGuess || null) : null;
  const isGuessPaused = Boolean(declaringGuess);
  const isCurrentPlayerEliminated = Boolean(user?.id && eliminatedPlayers.includes(user.id));
  const isActiveImposter = Boolean(isImposter && !isCurrentPlayerEliminated);
  const canDeclareGuess = Boolean(
    guessSystemEnabled &&
    isActiveImposter &&
    ['describing', 'voting'].includes(gameState?.phase) &&
    !isGuessPaused
  );

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

  const shuffleWords = (words) => {
    const copy = [...words];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const buildUniqueImposterWordsByUid = ({ word, category, imposterIds }) => {
    if (!Array.isArray(imposterIds) || imposterIds.length <= 1) return null;

    const sameCategoryPool = Array.from(
      new Set(
        WORD_LIST
          .filter((entry) => entry.category === category)
          .map((entry) => entry.word)
      )
    ).filter((candidate) => candidate !== word);

    const selectedWords = shuffleWords(sameCategoryPool).slice(0, imposterIds.length);

    if (selectedWords.length < imposterIds.length) {
      const excluded = new Set([word, ...selectedWords]);
      const fallbackPool = Array.from(new Set(WORD_LIST.map((entry) => entry.word)))
        .filter((candidate) => !excluded.has(candidate));
      const needed = imposterIds.length - selectedWords.length;
      selectedWords.push(...shuffleWords(fallbackPool).slice(0, needed));
    }

    if (selectedWords.length < imposterIds.length) {
      return null;
    }

    return imposterIds.reduce((acc, uid, index) => {
      acc[uid] = selectedWords[index];
      return acc;
    }, {});
  };

  const getWinningAgentLabel = (state, eliminatedOverride = null, winnerOverride = null) => {
    if (!state) return null;

    const winner = winnerOverride ?? state.winner;
    const eliminated = Array.isArray(eliminatedOverride)
      ? eliminatedOverride
      : (Array.isArray(state.eliminatedPlayers) ? state.eliminatedPlayers : []);
    const imposterIds = Array.isArray(state.imposterIds) ? state.imposterIds : [];

    if (state.rules?.imposterNoWord) {
      return state.winningAgent || null;
    }

    const winningImposterUids = winner === 'imposter'
      ? imposterIds.filter((uid) => !eliminated.includes(uid))
      : imposterIds;
    const fallbackUids = winningImposterUids.length > 0 ? winningImposterUids : imposterIds;
    const names = fallbackUids
      .map((uid) => getPlayerByUid(uid)?.displayName || 'Unknown')
      .filter(Boolean);

    return names.length > 0 ? names.join(', ') : null;
  };

  const getRandomStartAndDirection = (players) => {
    if (!players?.length) {
      return { startingPlayerId: null, direction: 'clockwise' };
    }

    const startingPlayer = players[Math.floor(Math.random() * players.length)];
    const direction = Math.random() < 0.5 ? 'clockwise' : 'anticlockwise';

    return {
      startingPlayerId: startingPlayer.uid,
      direction
    };
  };

  const getActivePlayersForState = (state, eliminatedOverride = null) => {
    const statePlayers = Array.isArray(state?.players) ? state.players : [];
    const eliminated = Array.isArray(eliminatedOverride)
      ? eliminatedOverride
      : (Array.isArray(state?.eliminatedPlayers) ? state.eliminatedPlayers : []);

    return statePlayers.filter((player) => !eliminated.includes(player.uid));
  };

  const evaluateWinnerForState = (state, eliminatedOverride = null) => {
    const eliminated = Array.isArray(eliminatedOverride)
      ? eliminatedOverride
      : (Array.isArray(state?.eliminatedPlayers) ? state.eliminatedPlayers : []);
    const remainingPlayers = getActivePlayersForState(state, eliminated);
    const remainingImposters = (state?.imposterIds || []).filter((uid) => !eliminated.includes(uid));

    if (remainingImposters.length === 0) {
      return 'town';
    }

    if (remainingPlayers.length === 2 && remainingImposters.length >= 1) {
      return 'imposter';
    }

    return null;
  };

  const goToDescribingRound = async (baseState, extraUpdates = {}) => {
    const roomRef = doc(db, 'rooms', roomId);
    const roundPlayers = getActivePlayersForState(baseState);
    const { startingPlayerId, direction } = getRandomStartAndDirection(roundPlayers);
    const currentRound = Number.isInteger(baseState?.roundNumber) ? baseState.roundNumber : 1;

    await updateDoc(roomRef, {
      'activeActivity.phase': 'describing',
      'activeActivity.phaseStartedAt': Date.now(),
      'activeActivity.startingPlayerId': startingPlayerId,
      'activeActivity.direction': direction,
      'activeActivity.eliminatedPlayers': Array.isArray(baseState?.eliminatedPlayers) ? baseState.eliminatedPlayers : [],
      'activeActivity.readyVotes': [],
      'activeActivity.votes': {},
      'activeActivity.declaringGuess': null,
      'activeActivity.pausedFromPhase': null,
      'activeActivity.eliminatedUid': null,
      'activeActivity.winner': null,
      'activeActivity.wordRevealed': null,
      'activeActivity.winningAgent': null,
      'activeActivity.autoEndAfterCorrectGuess': null,
      'activeActivity.roundNumber': currentRound + 1,
      ...extraUpdates,
      lastActivity: serverTimestamp()
    });
  };

  // === HOST ACTIONS ===

  const handleStartDescribing = async () => {
    if (!isHost) return;

    const roomRoundPlayers = getActivePlayersForState(gameState);
    const { startingPlayerId, direction } = getRandomStartAndDirection(roomRoundPlayers);

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'describing',
      'activeActivity.phaseStartedAt': Date.now(),
      'activeActivity.startingPlayerId': startingPlayerId,
      'activeActivity.direction': direction,
      'activeActivity.eliminatedPlayers': Array.isArray(gameState?.eliminatedPlayers) ? gameState.eliminatedPlayers : [],
      'activeActivity.readyVotes': [],
      'activeActivity.votes': {},
      'activeActivity.declaringGuess': null,
      'activeActivity.pausedFromPhase': null,
      'activeActivity.eliminatedUid': null,
      'activeActivity.winner': null,
      'activeActivity.wordRevealed': null,
      'activeActivity.winningAgent': null,
      'activeActivity.autoEndAfterCorrectGuess': null,
      'activeActivity.roundNumber': Number.isInteger(gameState?.roundNumber) ? gameState.roundNumber : 1,
      lastActivity: serverTimestamp()
    });
  };

  const handleReadyToVote = async () => {
    if (!user || readyClicked || isCurrentPlayerEliminated || isGuessPaused) return;

    if (!activePlayerUids.includes(user.id)) return;

    setReadyClicked(true);

    const roomRef = doc(db, 'rooms', roomId);
    const currentReadyVotes = (gameState.readyVotes || []).filter((uid) => activePlayerUids.includes(uid));
    const updatedReadyVotes = [...new Set([...currentReadyVotes, user.id])];

    await updateDoc(roomRef, {
      'activeActivity.readyVotes': updatedReadyVotes,
      lastActivity: serverTimestamp()
    });
  };

  const startVotingPhase = async () => {
    if (!gameState) return;

    const roomRef = doc(db, 'rooms', roomId);
    const activeUids = getActivePlayersForState(gameState).map((player) => player.uid);
    const sanitizedVotes = {};
    Object.entries(gameState.votes || {}).forEach(([voterUid, targetUid]) => {
      if (activeUids.includes(voterUid) && activeUids.includes(targetUid)) {
        sanitizedVotes[voterUid] = targetUid;
      }
    });

    await updateDoc(roomRef, {
      'activeActivity.phase': 'voting',
      'activeActivity.votes': sanitizedVotes,
      'activeActivity.eliminatedUid': null,
      'activeActivity.readyVotes': [],
      'activeActivity.declaringGuess': null,
      'activeActivity.pausedFromPhase': null,
      lastActivity: serverTimestamp()
    });
  };

  const handleStartVotingNow = async () => {
    if (!isHost || !gameState || gameState.phase !== 'describing') return;
    await startVotingPhase();
  };

  // Host auto-advance when all players ready
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'describing' || isGuessPaused) return;

    const readyVotes = (gameState.readyVotes || []).filter((uid) => activePlayerUids.includes(uid));

    if (activePlayerUids.length > 0 && activePlayerUids.every((uid) => readyVotes.includes(uid))) {
      startVotingPhase().catch(err => console.error('Error advancing to voting:', err));
    }
  }, [isHost, gameState?.phase, gameState?.readyVotes, activePlayerUids, isGuessPaused]);

  const handleConfirmVote = async (targetUid) => {
    if (!user || !targetUid) {
      throw new Error('Vote unavailable');
    }

    if (isCurrentPlayerEliminated) {
      throw new Error('Eliminated players cannot vote');
    }

    if (isGuessPaused) {
      throw new Error('Voting is paused');
    }

    if (!activePlayerUids.includes(user.id) || !activePlayerUids.includes(targetUid)) {
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

    if (isGuessPaused) return;

    const roomRef = doc(db, 'rooms', roomId);
    const activeUids = getActivePlayersForState(gameState).map((player) => player.uid);
    const votes = Object.entries(gameState.votes || {}).reduce((acc, [voterUid, targetUid]) => {
      if (activeUids.includes(voterUid) && activeUids.includes(targetUid)) {
        acc[voterUid] = targetUid;
      }
      return acc;
    }, {});

    // Count votes
    const voteCounts = {};
    Object.values(votes).forEach((targetUid) => {
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

    // Tie means no elimination and a fresh describing round.
    if (candidates.length !== 1) {
      await goToDescribingRound(gameState);
      return;
    }

    const eliminated = candidates[0];

    if (!eliminated) return;

    const updatedEliminated = [...new Set([...(gameState.eliminatedPlayers || []), eliminated])];
    const winner = evaluateWinnerForState(gameState, updatedEliminated);

    if (winner) {
      const winningAgent = getWinningAgentLabel(gameState, updatedEliminated, winner);
      await updateDoc(roomRef, {
        'activeActivity.phase': 'ended',
        'activeActivity.winner': winner,
        'activeActivity.wordRevealed': true,
        'activeActivity.eliminatedUid': eliminated,
        'activeActivity.eliminatedPlayers': updatedEliminated,
        'activeActivity.votes': votes,
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
        'activeActivity.winningAgent': winningAgent,
        lastActivity: serverTimestamp()
      });
      return;
    }

    await goToDescribingRound(
      {
        ...gameState,
        eliminatedPlayers: updatedEliminated
      },
      {
        'activeActivity.eliminatedUid': eliminated,
        'activeActivity.eliminatedPlayers': updatedEliminated,
        'activeActivity.winner': null,
        'activeActivity.wordRevealed': null,
        'activeActivity.winningAgent': null
      }
    );
  };

  const handleDeclareGuess = async () => {
    if (!guessSystemEnabled) return;
    if (!canDeclareGuess || !user || !gameState) return;

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.declaringGuess': {
        uid: user.id,
        displayName: user.displayName || getPlayerByUid(user.id)?.displayName || 'Unknown'
      },
      'activeActivity.pausedFromPhase': gameState.phase,
      lastActivity: serverTimestamp()
    });
  };

  const handleResolveDeclareGuess = async (guessedCorrect) => {
    if (!guessSystemEnabled) return;
    if (!isHost || !gameState?.declaringGuess) return;

    const roomRef = doc(db, 'rooms', roomId);
    const declaringUid = gameState.declaringGuess.uid;
    const declaringName = gameState.declaringGuess.displayName || getPlayerByUid(declaringUid)?.displayName || 'Unknown';

    if (guessedCorrect) {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'imposter-guess',
        'activeActivity.winner': 'imposter',
        'activeActivity.wordRevealed': true,
        'activeActivity.winningAgent': declaringName,
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
        'activeActivity.autoEndAfterCorrectGuess': true,
        lastActivity: serverTimestamp()
      });
      return;
    }

    const updatedEliminated = [...new Set([...(gameState.eliminatedPlayers || []), declaringUid])];
    const winner = evaluateWinnerForState(gameState, updatedEliminated);

    if (winner) {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'ended',
        'activeActivity.winner': winner,
        'activeActivity.wordRevealed': true,
        'activeActivity.eliminatedUid': declaringUid,
        'activeActivity.eliminatedPlayers': updatedEliminated,
        'activeActivity.declaringGuess': null,
        'activeActivity.pausedFromPhase': null,
        'activeActivity.winningAgent': null,
        'activeActivity.autoEndAfterCorrectGuess': null,
        lastActivity: serverTimestamp()
      });
      return;
    }

    await goToDescribingRound(
      {
        ...gameState,
        eliminatedPlayers: updatedEliminated
      },
      {
        'activeActivity.eliminatedUid': declaringUid,
        'activeActivity.eliminatedPlayers': updatedEliminated,
        'activeActivity.winner': null,
        'activeActivity.wordRevealed': null,
        'activeActivity.winningAgent': null,
        'activeActivity.autoEndAfterCorrectGuess': null
      }
    );
  };

  const handleImposterGuessResult = async (_guessedCorrect) => {
    if (!guessSystemEnabled) return;
    if (!isHost) return;

    setGuessConfirmed(true);

    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      'activeActivity.phase': 'ended',
      'activeActivity.winner': gameState?.winner || 'imposter',
      'activeActivity.wordRevealed': true,
      'activeActivity.autoEndAfterCorrectGuess': null,
      'activeActivity.declaringGuess': null,
      'activeActivity.pausedFromPhase': null,
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
    const isNoWordMode = Boolean(gameState.rules?.imposterNoWord);
    const useUniqueImposterWords = !isNoWordMode && newImposterIds.length > 1;
    const imposterWordsByUid = useUniqueImposterWords
      ? buildUniqueImposterWordsByUid({ word, category, imposterIds: newImposterIds })
      : null;
    const defaultImposterWord = isNoWordMode ? null : related;
    const resolvedImposterWord = imposterWordsByUid
      ? Object.values(imposterWordsByUid).join(', ')
      : defaultImposterWord;

    // Random starting player and direction
    const startingPlayer = players[Math.floor(Math.random() * players.length)];
    const direction = Math.random() < 0.5 ? 'clockwise' : 'anticlockwise';

    await updateDoc(roomRef, {
      'activeActivity.phase': 'word-reveal',
      'activeActivity.word': word,
      'activeActivity.imposterWord': resolvedImposterWord,
      'activeActivity.imposterWordsByUid': imposterWordsByUid,
      'activeActivity.category': category,
      'activeActivity.imposterIds': newImposterIds,
      'activeActivity.startingPlayerId': startingPlayer.uid,
      'activeActivity.direction': direction,
      'activeActivity.readyVotes': [],
      'activeActivity.votes': {},
      'activeActivity.eliminatedUid': null,
      'activeActivity.eliminatedPlayers': [],
      'activeActivity.winner': null,
      'activeActivity.winningAgent': null,
      'activeActivity.wordRevealed': null,
      'activeActivity.declaringGuess': null,
      'activeActivity.pausedFromPhase': null,
      'activeActivity.autoEndAfterCorrectGuess': null,
      'activeActivity.roundNumber': 1,
      lastActivity: serverTimestamp()
    });
  };

  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'word-reveal') return;
    if (gameState.rules?.imposterNoWord) return;

    const imposterIds = Array.isArray(gameState.imposterIds) ? gameState.imposterIds : [];
    if (imposterIds.length <= 1) return;

    const existingByUid = gameState.imposterWordsByUid;
    const hasCompleteAssignment = existingByUid
      && imposterIds.every((uid) => typeof existingByUid[uid] === 'string' && existingByUid[uid].trim().length > 0);

    if (hasCompleteAssignment) return;

    const generatedByUid = buildUniqueImposterWordsByUid({
      word: gameState.word,
      category: gameState.category,
      imposterIds
    });

    if (!generatedByUid) return;

    const roomRef = doc(db, 'rooms', roomId);
    updateDoc(roomRef, {
      'activeActivity.imposterWordsByUid': generatedByUid,
      'activeActivity.imposterWord': Object.values(generatedByUid).join(', '),
      lastActivity: serverTimestamp()
    }).catch((err) => console.error('Error assigning unique imposter words:', err));
  }, [
    isHost,
    roomId,
    gameState?.phase,
    gameState?.rules?.imposterNoWord,
    gameState?.word,
    gameState?.category,
    gameState?.imposterIds,
    gameState?.imposterWordsByUid
  ]);

  useEffect(() => {
    if (!guessSystemEnabled) return;
    if (!isHost || gameState?.phase !== 'imposter-guess' || !gameState?.autoEndAfterCorrectGuess) return;

    const timeoutId = setTimeout(() => {
      handleImposterGuessResult(true).catch((err) => console.error('Error ending after correct guess:', err));
    }, 900);

    return () => clearTimeout(timeoutId);
  }, [guessSystemEnabled, isHost, gameState?.phase, gameState?.autoEndAfterCorrectGuess]);

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
                <p className="text-base mb-6" style={{ fontFamily: "'Permanent Marker', cursive", color: '#c9384c' }}>guess the word or blend in</p>
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
                  {isImposter
                    ? (gameState.imposterWordsByUid?.[user?.id] || gameState.imposterWord || gameState.word)
                    : gameState.word}
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
    const readyVotes = (gameState.readyVotes || []).filter((uid) => activePlayerUids.includes(uid));

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center">
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
              disabled={readyClicked || isCurrentPlayerEliminated || isGuessPaused}
              className="w-full font-bold py-4 rounded-xl transition-colors mb-3"
              style={{
                backgroundColor: (readyClicked || isCurrentPlayerEliminated || isGuessPaused) ? '#1a2540' : '#e8e4dc',
                color: (readyClicked || isCurrentPlayerEliminated || isGuessPaused) ? '#8899bb' : '#1a1a2e',
                fontFamily: "'Special Elite', monospace",
                border: 'none',
                opacity: (readyClicked || isCurrentPlayerEliminated || isGuessPaused) ? 0.7 : 1
              }}
            >
              {isCurrentPlayerEliminated ? 'Eliminated' : readyClicked ? 'Ready ✅' : 'Ready to Vote'}
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
                disabled={isGuessPaused}
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
                    onClick={() => handleResolveDeclareGuess(true)}
                    className="flex-1 font-bold py-3 rounded transition-colors"
                    style={{ backgroundColor: '#1e6a40', border: '1px solid #2a9d60', color: '#7effc4', fontFamily: "'Special Elite', monospace" }}
                  >
                    Correct
                  </button>
                  <button
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
    const votedCount = Object.keys(votes).filter((uid) => activePlayerUids.includes(uid)).length;

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
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
              votes={votes}
              currentUid={user?.id}
              isHost={isHost}
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
                    onClick={() => handleResolveDeclareGuess(true)}
                    className="flex-1 font-bold py-3 rounded transition-colors"
                    style={{ backgroundColor: '#1e6a40', border: '1px solid #2a9d60', color: '#7effc4', fontFamily: "'Special Elite', monospace" }}
                  >
                    Correct
                  </button>
                  <button
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
    const imposterWon = winner === 'imposter';
    const isImposterNoWordMode = Boolean(gameState.rules?.imposterNoWord);
    const caseClosedStampColor = imposterWon ? '#8b3a3a' : '#5a7a9a';
    const roundsPlayed = gameState.roundNumber || 1;
    const imposterIds = gameState.imposterIds || [];
    const eliminatedForSummary = Array.isArray(gameState.eliminatedPlayers) ? gameState.eliminatedPlayers : [];
    const agentLabel = getWinningAgentLabel(gameState, eliminatedForSummary, winner);
    const imposterWordsByUid = gameState.imposterWordsByUid || {};
    const imposterWordsSummary = (() => {
      const wordsFromMap = Array.from(new Set(Object.values(imposterWordsByUid).filter(Boolean)));
      if (wordsFromMap.length > 0) return wordsFromMap.join(', ');
      return gameState.imposterWord ? gameState.imposterWord : '—';
    })();
    const deceivedCount = imposterWon
      ? eliminatedForSummary.filter((uid) => !imposterIds.includes(uid)).length
      : eliminatedForSummary.filter((uid) => imposterIds.includes(uid)).length;

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
                  const eliminatedRound = eliminatedForSummary.indexOf(player.uid) + 1;
                  const survivedRounds = eliminatedRound > 0
                    ? Math.min(roundsPlayed, eliminatedRound)
                    : roundsPlayed;
                  const roundsLabel = `${survivedRounds} ${survivedRounds === 1 ? 'round' : 'rounds'}`;
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
