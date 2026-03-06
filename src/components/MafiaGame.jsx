import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials, getAvatarColor } from '../utils/avatar';
import { useMafiaSound } from '../hooks/useMafiaSound';
import { throttledUpdate } from '../utils/firestoreThrottle';

export default function MafiaGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading } = useRoom(roomId, user?.id, user?.displayName, user?.avatar || null);
  
  const [gameState, setGameState] = useState(null);
  const [gameStateLoaded, setGameStateLoaded] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [showRole, setShowRole] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const phaseTimerRef = useRef(null);
  const phaseTimeoutTriggeredRef = useRef(false);
  const { playShh, playMurder, playAngelic, playWaking } = useMafiaSound();
  const timerJumpedRef = useRef(false);
  const previousPhaseRef = useRef(null);
  const handlePhaseTimeoutRef = useRef(null);

  // DIAGNOSIS FINDINGS:
  // FIX 1: checkAllConfirmed (timer skip) only runs when the HOST confirms via handleConfirmVote.
  //   Skip discussion works because it has a useEffect watching gameState.skipVotes on the host.
  //   Confirm vote has NO equivalent useEffect — so if the host is not an active player
  //   (e.g. host is civilian during night-mafia), checkAllConfirmed is never called.
  //   FIX: Add a useEffect mirroring the skip discussion pattern that watches confirmedVotes.
  //
  // FIX 2: Doctor timer expiry IS handled in handlePhaseTimeout (calls advanceFromDoctorPhase).
  //   But the timer setInterval(100ms) can call handlePhaseTimeout repeatedly before the
  //   Firestore update propagates back. This race condition affects ALL phases.
  //   FIX: Add phaseTimeoutTriggeredRef guard to prevent multiple handlePhaseTimeout calls.
  //
  // FIX 3: Inconsistent messaging — night-eyes-closed shows "Close your eyes 🤫" while
  //   post-vote transitions show "Close your eyes... 😴". Non-active player screens during
  //   voting show "Shhh..." variants. Detective-result non-detective has no countdown.
  //   FIX: Unify all to "Close your eyes 😴" and add countdown where missing.
  //
  // FIX 4: advanceFromDoctorPhase uses undefined for doctorSave when doctor hasn't voted
  //   (gameState.nightVotes?.[uid] returns undefined). Firestore ignores undefined fields.
  //   FIX: Explicitly coalesce to null.

  // Rules form state
  const [rules, setRules] = useState({
    mafiaCount: 1,
    doctor: true,
    detective: true,
    discussionTime: 3,
    votingTime: 1
  });
  const activeRules = gameState?.rules || rules;

  const getCurrentPlayer = () => gameState?.players?.find((player) => player.uid === user?.id);

  const isCurrentUserAlive = () => {
    const currentPlayer = getCurrentPlayer();
    return Boolean(currentPlayer && currentPlayer.isAlive);
  };

  const getLivingPlayers = (players = gameState?.players || []) => {
    return players.filter((player) => player.isAlive);
  };

  const getWinnerFromPlayers = (players) => {
    const livingMafia = players.filter((player) => player.role === 'mafia' && player.isAlive).length;
    const livingInnocent = players.filter((player) => player.role !== 'mafia' && player.isAlive).length;

    if (livingMafia === 0) return 'town';
    if (livingMafia >= livingInnocent) return 'mafia';
    return null;
  };

  // Subscribe to game state and detect phase changes for sounds
  useEffect(() => {
    if (!roomId) return;

    const roomRef = doc(db, 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        console.log('[MafiaGame] Firestore update received:', {
          phase: data.activeActivity?.phase,
          phaseEndsAt: data.activeActivity?.phaseEndsAt,
          confirmedVotes: data.activeActivity?.confirmedVotes,
          players: data.activeActivity?.players,
        });

        if (data.activeActivity && data.activeActivity.type === 'mafia') {
          setGameState(data.activeActivity);
          setGameStateLoaded(true); // Ensure gameStateLoaded is updated when valid data is received

          const newPhase = data.activeActivity.phase;
          if (newPhase !== previousPhaseRef.current) {
            previousPhaseRef.current = newPhase;
            timerJumpedRef.current = false; // Reset timer jump guard on phase change
          }
        } else {
          console.log('[MafiaGame] No active Mafia game found');
          setGameState(null);
        }
      }
    });

    return () => unsubscribe();
  }, [roomId]);

  // Set my role when game state changes
  useEffect(() => {
    if (gameState && gameState.players && user) {
      const myPlayer = gameState.players.find(p => p.uid === user.id);
      if (myPlayer) {
        console.log('[MafiaGame] Setting myRole:', myPlayer.role);
        setMyRole(myPlayer.role);
      }
    }
  }, [gameState, user]);

  // Host auto-advances discussion if all living players voted to skip
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'day-discussion') return;

    const livingUids = getLivingPlayers().map((player) => player.uid);
    const skipVotes = gameState.skipVotes || [];

    if (livingUids.length > 0 && livingUids.every((uid) => skipVotes.includes(uid))) {
      const roomRef = doc(db, 'rooms', roomId);
      startDayVotePhase(roomRef);
    }
  }, [isHost, gameState?.phase, gameState?.skipVotes, gameState?.players, roomId]);

  // FIX 1: Host auto-shortens timer if all active players have confirmed votes
  // Mirrors the skip discussion useEffect pattern — reacts to Firestore state changes
  // so it works even when the host is NOT one of the active/voting players.
  useEffect(() => {
    if (!isHost || !gameState) return;
    const phase = gameState.phase;
    if (phase !== 'night-mafia' && phase !== 'night-doctor' && phase !== 'night-detective' && phase !== 'day-vote') return;

    if (timerJumpedRef.current) return; // Prevent repeated timer jumps

    const activePlayerUids = getActivePlayers().map(p => p.uid);
    const confirmed = gameState.confirmedVotes || [];

    if (activePlayerUids.length > 0 && activePlayerUids.every(uid => confirmed.includes(uid))) {
      console.log(`[MafiaGame] All players confirmed for ${phase}, jumping timer via useEffect`);
      timerJumpedRef.current = true; // Mark timer jump as fired
      const roomRef = doc(db, 'rooms', roomId);
      throttledUpdate(
        `timer-jump-${phase}`,
        () => updateDoc(roomRef, {
          'activeActivity.phaseEndsAt': Date.now() + 5000,
          lastActivity: serverTimestamp()
        }),
        2000
      ).catch(error => {
        console.error(`Error jumping timer for ${phase}:`, error);
      });
    }
  }, [isHost, gameState?.phase, gameState?.confirmedVotes, gameState?.players, roomId]);

  // Store the latest gameState in a ref to prevent stale closures
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Handle phase timer countdown using Firestore phaseEndsAt with fallback
  useEffect(() => {
    if (!gameState || (!gameState.phaseEndsAt && (!gameState.phaseStartedAt || !gameState.phaseDurationMs))) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const currentGameState = gameStateRef.current;
      const phaseEndsAt = currentGameState.phaseEndsAt?.toMillis ? currentGameState.phaseEndsAt.toMillis() : currentGameState.phaseEndsAt;
      const phaseStarted = currentGameState.phaseStartedAt?.toMillis ? currentGameState.phaseStartedAt.toMillis() : currentGameState.phaseStartedAt;

      let remaining = 0;
      if (phaseEndsAt) {
        remaining = Math.max(0, phaseEndsAt - now);
      } else if (phaseStarted && currentGameState.phaseDurationMs) {
        const elapsed = now - phaseStarted;
        remaining = Math.max(0, currentGameState.phaseDurationMs - elapsed);
      }

      const remainingSeconds = Math.max(0, Math.ceil(remaining / 1000));
      setTimeLeft(remainingSeconds);

      // Only host auto-advances phases — guard prevents multiple calls during
      // the gap between Firestore write and snapshot propagation (FIX 2)
      if (remainingSeconds <= 0) {
        console.log('[MafiaGame] Timer hit zero, attempting phase transition for:', currentGameState.phase);
        console.log('[MafiaGame] isHost check:', isHost);
        console.log('[MafiaGame] phaseTimeoutTriggeredRef:', phaseTimeoutTriggeredRef.current);
      }
      
      if (isHost && remainingSeconds <= 0 && !phaseTimeoutTriggeredRef.current) {
        console.log('[MafiaGame] Triggering handlePhaseTimeout:', { remainingSeconds });
        phaseTimeoutTriggeredRef.current = true;
        handlePhaseTimeoutRef.current();
      }
    };

    updateTimer();
    phaseTimerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (phaseTimerRef.current) {
        clearInterval(phaseTimerRef.current);
      }
    };
  }, [isHost]);

  useEffect(() => {
    const phaseEndsAt = gameState?.phaseEndsAt?.toMillis ? gameState.phaseEndsAt.toMillis() : gameState?.phaseEndsAt;
    console.log('[MafiaGame] phaseEndsAt updated:', { phase: gameState?.phase, phaseEndsAt });
  }, [gameState?.phaseEndsAt, gameState?.phase]);

  // Reset confirmed status and timeout guard when phase changes
  useEffect(() => {
    phaseTimeoutTriggeredRef.current = false;
    if (gameState) {
      setHasConfirmed(gameState.confirmedVotes?.includes(user?.id) || false);
      if (gameState.phase === 'night-mafia' || gameState.phase === 'night-doctor' || 
          gameState.phase === 'night-detective' || gameState.phase === 'day-vote') {
        setSelectedPlayer(gameState.nightVotes?.[user?.id] || gameState.dayVotes?.[user?.id] || null);
      } else {
        setSelectedPlayer(null);
      }
    }
  }, [gameState?.phase]);

  const handlePhaseTimeout = async () => {
    console.log('[handlePhaseTimeout] Called with phase:', gameState?.phase, 'isHost:', isHost, 'gameState exists:', !!gameState);
    
    if (!isHost || !gameState) return;

    const roomRef = doc(db, 'rooms', roomId);

    try {
      switch (gameState.phase) {
        case 'night-mafia':
          console.log('HOST writing phase transition to: night-eyes-closed-2');
          await advanceFromMafiaPhase(roomRef);
          break;
        case 'night-doctor':
          console.log('HOST writing phase transition to: night-eyes-closed-3');
          await advanceFromDoctorPhase(roomRef);
          break;
        case 'night-detective':
          console.log('HOST writing phase transition to: night-detective-result');
          await advanceFromDetectivePhase(roomRef);
          break;
        case 'day-discussion':
          console.log('HOST writing phase transition to: day-vote');
          await startDayVotePhase(roomRef);
          break;
        case 'day-vote':
          console.log('HOST writing phase transition to: end-game');
          await processVoteAndCheckWin(roomRef);
          break;
      }
    } catch (error) {
      console.error('Error in handlePhaseTimeout:', error);
    }
  };

  // Keep ref always pointing to the latest handlePhaseTimeout so the
  // setInterval closure (which depends only on [isHost]) never calls a
  // stale version that sees gameState === null.
  handlePhaseTimeoutRef.current = handlePhaseTimeout;

  const handleRevealRole = () => {
    setShowRole(true);
  };

  const handleHideRole = () => {
    setShowRole(false);
  };

  const startNightPhase = async () => {
    if (!isHost) return;
    
    const roomRef = doc(db, 'rooms', roomId);

    await updateDoc(roomRef, {
      'activeActivity.phase': 'night-eyes-closed',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': 3000,
      'activeActivity.phaseEndsAt': Date.now() + 3000,
      'activeActivity.nightVotes': {},
      'activeActivity.confirmedVotes': [],
      'activeActivity.pendingVictim': null,
      'activeActivity.doctorSave': null,
      'activeActivity.detectiveResult': null,
      lastActivity: serverTimestamp()
    });

    // After 3 seconds, advance to mafia turn
    setTimeout(async () => {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'night-mafia',
        'activeActivity.phaseStartedAt': serverTimestamp(),
        'activeActivity.phaseDurationMs': 30000,
        'activeActivity.phaseEndsAt': Date.now() + 30000,
        'activeActivity.confirmedVotes': [],
        'activeActivity.nightVotes': {},
        lastActivity: serverTimestamp()
      });
    }, 3000);
  };

  const handleVotePlayer = async (targetUid) => {
    if (!user || hasConfirmed || !gameState) return;
    if (!isCurrentUserAlive()) return;
    if (myRole === 'narrator') return;
    
    setSelectedPlayer(targetUid);
  };

  const handleConfirmVote = async () => {
    if (!user || !selectedPlayer || hasConfirmed || !gameState) return;
    if (!isCurrentUserAlive()) return;
    if (myRole === 'narrator') return;

    const roomRef = doc(db, 'rooms', roomId);
    const voteField = gameState.phase === 'day-vote' ? 'dayVotes' : 'nightVotes';
    const confirmedVotes = Array.from(new Set([...(gameState.confirmedVotes || []), user.id]));

    await updateDoc(roomRef, {
      [`activeActivity.${voteField}.${user.id}`]: selectedPlayer,
      'activeActivity.confirmedVotes': confirmedVotes,
      lastActivity: serverTimestamp()
    });

    setHasConfirmed(true);

    if (isHost) {
      await checkAllConfirmed(confirmedVotes);
    }
  };

  const checkAllConfirmed = async (confirmedVotesOverride) => {
    if (!isHost || !gameState) return;
    if (timerJumpedRef.current) {
      console.log('[checkAllConfirmed] Timer already jumped for this phase, skipping');
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    const activePlayerUids = getActivePlayers().map(p => p.uid);
    const confirmed = confirmedVotesOverride || gameState.confirmedVotes || [];

    if (activePlayerUids.length > 0 && activePlayerUids.every(uid => confirmed.includes(uid))) {
      // All confirmed, shorten timer to 5 seconds for synchronized clients
      timerJumpedRef.current = true; // Mark timer jump as fired
      switch (gameState.phase) {
        case 'night-mafia':
          try {
            console.log('Jumping timer for phase night-mafia');
            await throttledUpdate(
              'timer-jump-night-mafia',
              () => updateDoc(roomRef, {
                'activeActivity.phaseEndsAt': Date.now() + 5000,
                lastActivity: serverTimestamp()
              }),
              2000
            );
          } catch (error) {
            console.error('Error jumping timer for night-mafia:', error);
          }
          break;
        case 'night-doctor':
          try {
            console.log('Jumping timer for phase night-doctor');
            await throttledUpdate(
              'timer-jump-night-doctor',
              () => updateDoc(roomRef, {
                'activeActivity.phaseEndsAt': Date.now() + 5000,
                lastActivity: serverTimestamp()
              }),
              2000
            );
          } catch (error) {
            console.error('Error jumping timer for night-doctor:', error);
          }
          break;
        case 'night-detective':
          try {
            console.log('Jumping timer for phase night-detective');
            await throttledUpdate(
              'timer-jump-night-detective',
              () => updateDoc(roomRef, {
                'activeActivity.phaseEndsAt': Date.now() + 5000,
                lastActivity: serverTimestamp()
              }),
              2000
            );
          } catch (error) {
            console.error('Error jumping timer for night-detective:', error);
          }
          break;
        case 'day-vote':
          try {
            console.log('Jumping timer for phase day-vote');
            await throttledUpdate(
              'timer-jump-day-vote',
              () => updateDoc(roomRef, {
                'activeActivity.phaseEndsAt': Date.now() + 5000,
                lastActivity: serverTimestamp()
              }),
              2000
            );
          } catch (error) {
            console.error('Error jumping timer for day-vote:', error);
          }
          break;
      }
    }
  };

  const advanceFromMafiaPhase = async (roomRef, closeEyesMs = 2000) => {
    if (!isHost) return;

    // Count votes
    const votes = gameState.nightVotes || {};
    const voteCounts = {};
    Object.values(votes).forEach(targetUid => {
      voteCounts[targetUid] = (voteCounts[targetUid] || 0) + 1;
    });

    // Find most voted
    let maxVotes = 0;
    let victims = [];
    Object.entries(voteCounts).forEach(([uid, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        victims = [uid];
      } else if (count === maxVotes) {
        victims.push(uid);
      }
    });

    // Random tiebreak
    const victim = victims.length > 0 ? victims[Math.floor(Math.random() * victims.length)] : null;

    await updateDoc(roomRef, {
      'activeActivity.pendingVictim': victim,
      'activeActivity.phase': 'night-eyes-closed-2',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': closeEyesMs,
      'activeActivity.phaseEndsAt': Date.now() + closeEyesMs,
      'activeActivity.confirmedVotes': [],
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDoctorPhase = async (roomRef) => {
    const doctorPlayer = gameState.players.find(p => p.role === 'doctor');
    const phaseDuration = doctorPlayer && doctorPlayer.isAlive ? 30000 : 10000;
    
    await updateDoc(roomRef, {
      'activeActivity.phase': 'night-doctor',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': phaseDuration,
      'activeActivity.phaseEndsAt': Date.now() + phaseDuration,
      'activeActivity.confirmedVotes': [],
      lastActivity: serverTimestamp(),
      'activeActivity.doctorEmoji': '🩺' // Updated emoji for doctor role
    });
  };

  const advanceFromDoctorPhase = async (roomRef, closeEyesMs = 2000) => {
    if (!isHost) return;

    const doctorPlayer = gameState.players.find(p => p.role === 'doctor' && p.isAlive);
    const save = doctorPlayer ? (gameState.nightVotes?.[doctorPlayer.uid] ?? null) : null;

    if (!doctorPlayer) {
      await updateDoc(roomRef, {
        'activeActivity.doctorSave': null,
        'activeActivity.confirmedVotes': [],
        'activeActivity.nightVotes': {},
        lastActivity: serverTimestamp()
      });

      if (activeRules.detective) {
        await startDetectivePhase(roomRef);
      } else {
        await startDayPhase(roomRef);
      }
      return;
    }

    await updateDoc(roomRef, {
      'activeActivity.doctorSave': save,
      'activeActivity.confirmedVotes': [],
      'activeActivity.phase': 'night-eyes-closed-3',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': closeEyesMs,
      'activeActivity.phaseEndsAt': Date.now() + closeEyesMs,
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDetectivePhase = async (roomRef) => {
    const detectivePlayer = gameState.players.find(p => p.role === 'detective');
    const phaseDuration = detectivePlayer && detectivePlayer.isAlive ? 30000 : 10000;
    
    await updateDoc(roomRef, {
      'activeActivity.phase': 'night-detective',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': phaseDuration,
      'activeActivity.phaseEndsAt': Date.now() + phaseDuration,
      'activeActivity.confirmedVotes': [],
      lastActivity: serverTimestamp()
    });
  };

  const advanceFromDetectivePhase = async (roomRef) => {
    if (!isHost) return;

    const detectivePlayer = gameState.players.find(p => p.role === 'detective' && p.isAlive);
    const investigateUid = detectivePlayer ? gameState.nightVotes?.[detectivePlayer.uid] : null;
    
    let result = null;
    if (investigateUid) {
      const target = gameState.players.find(p => p.uid === investigateUid);
      result = {
        targetUid: investigateUid,
        targetName: target?.displayName,
        isMafia: target?.role === 'mafia'
      };
    }

    await updateDoc(roomRef, {
      'activeActivity.detectiveResult': result,
      'activeActivity.confirmedVotes': [],
      'activeActivity.phase': 'night-detective-result',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': 5000,
      'activeActivity.phaseEndsAt': Date.now() + 5000,
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDayPhase = async (roomRef) => {
    const currentPlayers = [...(gameState?.players || [])];
    const pendingVictim = gameState?.pendingVictim || null;
    const doctorAlive = currentPlayers.some((player) => player.role === 'doctor' && player.isAlive);
    const isSaved = Boolean(activeRules.doctor && doctorAlive && pendingVictim && gameState?.doctorSave === pendingVictim);

    const updatedPlayers = currentPlayers.map((player) => {
      if (!pendingVictim || isSaved) return player;
      if (player.uid === pendingVictim) {
        return { ...player, isAlive: false };
      }
      return player;
    });

    const winner = getWinnerFromPlayers(updatedPlayers);
    if (winner) {
      await updateDoc(roomRef, {
        'activeActivity.players': updatedPlayers,
        'activeActivity.lastEliminated': !isSaved ? pendingVictim : null,
        'activeActivity.lastSaved': isSaved ? pendingVictim : null,
        'activeActivity.phase': 'ended',
        'activeActivity.winner': winner,
        'activeActivity.phaseEndsAt': null,
        'activeActivity.phaseStartedAt': null,
        'activeActivity.phaseDurationMs': null,
        lastActivity: serverTimestamp()
      });
      return;
    }

    const discussionDurationMs = activeRules.discussionTime * 60 * 1000;

    await updateDoc(roomRef, {
      'activeActivity.phase': 'day-discussion',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': discussionDurationMs,
      'activeActivity.phaseEndsAt': Date.now() + discussionDurationMs,
      'activeActivity.players': updatedPlayers,
      'activeActivity.lastEliminated': !isSaved ? pendingVictim : null,
      'activeActivity.lastSaved': isSaved ? pendingVictim : null,
      'activeActivity.skipVotes': [],
      'activeActivity.nightVotes': {},
      lastActivity: serverTimestamp()
    });
  };

  const startDayVotePhase = async (roomRef) => {
    const votingDurationMs = activeRules.votingTime * 60 * 1000;
    
    await updateDoc(roomRef, {
      'activeActivity.phase': 'day-vote',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': votingDurationMs,
      'activeActivity.phaseEndsAt': Date.now() + votingDurationMs,
      'activeActivity.dayVotes': {},
      'activeActivity.skipVotes': [],
      'activeActivity.confirmedVotes': [],
      lastActivity: serverTimestamp()
    });
  };

  const processVoteAndCheckWin = async (roomRef) => {
    if (!isHost) return;

    // Count votes
    const votes = gameState.dayVotes || {};
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
    const eliminated = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;

    // Update player as dead
    const updatedPlayers = gameState.players.map(p => 
      p.uid === eliminated ? { ...p, isAlive: false } : p
    );

    await updateDoc(roomRef, {
      'activeActivity.players': updatedPlayers,
      'activeActivity.lastEliminated': eliminated,
      lastActivity: serverTimestamp()
    });

    // Check win condition
    const winner = getWinnerFromPlayers(updatedPlayers);

    if (winner) {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'ended',
        'activeActivity.winner': winner,
        'activeActivity.phaseEndsAt': null,
        'activeActivity.phaseStartedAt': null,
        'activeActivity.phaseDurationMs': null,
        lastActivity: serverTimestamp()
      });
    } else {
      // Continue to next round
      await updateDoc(roomRef, {
        'activeActivity.roundNumber': gameState.roundNumber + 1,
        'activeActivity.phaseEndsAt': null,
        'activeActivity.phaseStartedAt': null,
        'activeActivity.phaseDurationMs': null,
        lastActivity: serverTimestamp()
      });

      // Wait 5 seconds then start next night
      setTimeout(async () => {
        await startNightPhase();
      }, 5000);
    }
  };

  const handleToggleSkipDiscussion = async () => {
    if (!gameState || !user || gameState.phase !== 'day-discussion') return;
    if (!isCurrentUserAlive()) return;

    const roomRef = doc(db, 'rooms', roomId);
    const currentSkipVotes = gameState.skipVotes || [];
    const hasVoted = currentSkipVotes.includes(user.id);
    const updatedSkipVotes = hasVoted
      ? currentSkipVotes.filter((uid) => uid !== user.id)
      : [...currentSkipVotes, user.id];

    await updateDoc(roomRef, {
      'activeActivity.skipVotes': updatedSkipVotes,
      lastActivity: serverTimestamp()
    });

    if (isHost) {
      const livingUids = getLivingPlayers().map((player) => player.uid);
      if (livingUids.length > 0 && livingUids.every((uid) => updatedSkipVotes.includes(uid))) {
        await startDayVotePhase(roomRef);
      }
    }
  };

  const handleReturnToGameNight = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp()
    });
    navigate(`/room/${roomId}`);
  };

  const handleCancelGame = async () => {
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, {
      activeActivity: null,
      lastActivity: serverTimestamp()
    });
    navigate(`/room/${roomId}`);
  };

  const getActivePlayers = () => {
    if (!gameState) return [];
    
    switch (gameState.phase) {
      case 'night-mafia':
        return gameState.players.filter(p => p.role === 'mafia' && p.isAlive);
      case 'night-doctor':
        const doctor = gameState.players.find(p => p.role === 'doctor' && p.isAlive);
        return doctor ? [doctor] : [];
      case 'night-detective':
        const detective = gameState.players.find(p => p.role === 'detective' && p.isAlive);
        return detective ? [detective] : [];
      case 'day-vote':
        return gameState.players.filter(p => p.isAlive === true);
      default:
        return [];
    }
  };

  const getSelectablePlayers = () => {
    if (!gameState) return [];

    switch (gameState.phase) {
      case 'night-mafia':
        return gameState.players.filter(p => p.role !== 'mafia' && p.isAlive);
      case 'night-doctor':
        return gameState.players.filter(p => p.isAlive);
      case 'night-detective':
        return gameState.players.filter(p => p.isAlive && p.uid !== user?.id);
      case 'day-vote':
        return gameState.players.filter(p => p.isAlive === true);
      default:
        return [];
    }
  };

  const isSpectator = () => {
    if (!myRole) return true;
    const me = gameState?.players?.find(p => p.uid === user?.id);
    return me && !me.isAlive;
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'mafia':
        return '🔪';
      case 'civilian':
        return '👤';
      case 'doctor':
        return '⚕️';
      case 'detective':
        return '🔍';
      default:
        return '❓';
    }
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'mafia':
        return 'from-red-900 to-red-800';
      case 'civilian':
        return 'from-blue-900 to-blue-800';
      case 'doctor':
        return 'from-green-900 to-green-800';
      case 'detective':
        return 'from-yellow-900 to-yellow-800';
      default:
        return 'from-slate-900 to-slate-800';
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show loading screen while waiting for auth and room data to load
  const isLoading = authLoading || roomLoading || !gameStateLoaded;
  console.log('[MafiaGame] Render state', { phase: gameState?.phase, isHost, isLoading });
  
  if (isLoading) {
    console.log('[MafiaGame] Still loading...', { authLoading, roomLoading, gameStateLoaded });
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

  // All data loaded - now safe to check redirect conditions
  
  // Phase 1: No active game - redirect to home
  if (!gameState) {
    console.log('[MafiaGame] No gameState found - redirecting to room');
    navigate(`/room/${roomId}`);
    return null;
  }

  // Phase 2: Lobby - should be handled on HomeScreen, redirect if accessed directly
  if (gameState?.phase === 'lobby') {
    console.log('[MafiaGame] User accessed lobby directly - redirecting to room', { isHost });
    // Redirect non-hosts and hosts back to HomeScreen to manage lobby there
    navigate(`/room/${roomId}`);
    return null;
  }

  // Phase 3: Role reveal
  if (gameState?.phase === 'roles') {
    console.log('[MafiaGame] Rendering roles phase', { myRole, user: user?.id });
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

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {!showRole ? (
            <div className="text-center">
              <div className="text-6xl mb-6">🤫</div>
              <h1 className="text-white text-2xl font-bold mb-4">Your role is hidden</h1>
              <p className="text-slate-400 mb-8">Tap Reveal to see your role</p>
              <button
                onClick={handleRevealRole}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Reveal Role
              </button>
            </div>
          ) : (
            <div className={`bg-gradient-to-br ${getRoleColor(myRole)} border-2 border-white/20 rounded-2xl p-8 text-center`}>
              <div className="text-8xl mb-6">{getRoleIcon(myRole)}</div>
              <h1 className="text-white text-3xl font-black uppercase mb-4">{myRole}</h1>
              <p className="text-white/80 mb-8">
                {myRole === 'mafia' && 'Kill townspeople without getting caught'}
                {myRole === 'civilian' && 'Find and eliminate the mafia'}
                {myRole === 'doctor' && 'Save players from the mafia each night'}
                {myRole === 'detective' && 'Investigate players to find the mafia'}
              </p>
              <button
                onClick={handleHideRole}
                className="w-full bg-white/20 hover:bg-white/30 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Hide Role
              </button>
            </div>
          )}

          <div className="mt-6">
            {isHost ? (
              <button
                onClick={startNightPhase}
                className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors"
              >
                Start Night 🌙
              </button>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center">
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
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-8xl mb-6">😴</div>
          <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
          {timeLeft !== null && (
            <p className="text-slate-300 font-mono text-2xl mt-4">{formatTime(timeLeft)}</p>
          )}
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
          <div className="w-full max-w-md mx-auto">
            <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">💀</div>
              <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
            </div>

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
                        <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                          {getInitials(player.displayName)}
                        </div>
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
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-8xl mb-6">😴</div>
            <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
          </div>
        </div>
      );
    }

    // Active mafia player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-red-900 to-red-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-6">
            {timeLeft !== null && (
              <div className="text-red-300 font-mono text-4xl mb-2">{formatTime(timeLeft)}</div>
            )}
            <h2 className="text-white text-xl font-semibold">Choose a player to kill</h2>
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.map((player) => (
              <button
                key={player.uid}
                onClick={() => handleVotePlayer(player.uid)}
                disabled={hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid
                    ? 'bg-red-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${hasConfirmed ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
                <span className="text-white font-semibold">{player.displayName}</span>
              </button>
            ))}
          </div>

          <button
            onClick={handleConfirmVote}
            disabled={!selectedPlayer || hasConfirmed}
            className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-red-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
          >
            {hasConfirmed ? 'Vote Confirmed' : 'Confirm'}
          </button>
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
          <div className="w-full max-w-md mx-auto">
            {myRole === 'narrator' && (
              <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">🎙️</div>
                <h2 className="text-white font-bold text-xl">NARRATOR</h2>
              </div>
            )}
            {myRole !== 'narrator' && (
              <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">💀</div>
                <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
              </div>
            )}

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Doctor Turn</h3>
                {timeLeft !== null && (
                  <p className="text-green-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isDoctor) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-8xl mb-6">😴</div>
            <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
          </div>
        </div>
      );
    }

    // Active doctor player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-950 via-green-900 to-green-950 p-6">
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
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
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
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
          <div className="w-full max-w-md mx-auto">
            <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">💀</div>
              <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="text-center mb-4">
                <h3 className="text-white font-semibold text-lg">Detective Turn</h3>
                {timeLeft !== null && (
                  <p className="text-yellow-400 font-mono text-2xl">{formatTime(timeLeft)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!isDetective) {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-6">
          <div className="text-center">
            <div className="text-8xl mb-6">😴</div>
            <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
          </div>
        </div>
      );
    }

    // Active detective player
    const selectablePlayers = getSelectablePlayers();
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-950 via-yellow-900 to-yellow-950 p-6">
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
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
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
            <div className={`text-8xl mb-6`}>
              {result.isMafia ? '🔪' : '✅'}
            </div>
            <h1 className="text-white text-3xl font-bold mb-4">
              {result.targetName}
            </h1>
            <p className="text-white text-2xl">
              {result.isMafia ? 'IS a mafia' : 'is NOT a mafia'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-8xl mb-6">😴</div>
          <h1 className="text-white text-4xl font-black">Close your eyes 😴</h1>
          {timeLeft !== null && (
            <p className="text-slate-300 font-mono text-2xl mt-4">{formatTime(timeLeft)}</p>
          )}
        </div>
      </div>
    );
  }

  // Day phase - Discussion
  if (gameState?.phase === 'day-discussion') {
    const spectator = isSpectator();
    const victimUid = gameState.pendingVictim;
    const saved = gameState.lastSaved && gameState.lastSaved === victimUid;
    const victim = victimUid ? gameState.players.find(p => p.uid === victimUid) : null;
    const livingPlayers = gameState.players.filter((p) => p.isAlive && p.role !== 'narrator');
    const skipVotes = gameState.skipVotes || [];
    const canSkipVote = !spectator && isCurrentUserAlive() && myRole !== 'narrator';
    const mySkipVote = skipVotes.includes(user?.id);
    const skipVotePlayers = skipVotes
      .map((uid) => gameState.players.find((p) => p.uid === uid))
      .filter(Boolean);

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          {spectator && myRole === 'narrator' && (
            <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">🎙️</div>
              <h2 className="text-white font-bold text-xl">NARRATOR</h2>
            </div>
          )}
          {spectator && myRole !== 'narrator' && (
            <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">💀</div>
              <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
            </div>
          )}

          <div className="text-center mb-6">
            <div className="text-6xl mb-4">👀</div>
            <h1 className="text-white text-3xl font-black mb-4">Open your eyes!</h1>
            
            {victim && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-4">
                {saved ? (
                  <>
                    <p className="text-white text-lg mb-2">
                      <span className="font-bold">{victim.displayName}</span> was attacked last night
                    </p>
                    <p className="text-green-400 text-lg font-bold">
                      But the doctor saved them! 🏥
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-white text-lg">
                      <span className="font-bold">{victim.displayName}</span> was killed last night
                    </p>
                    <p className="text-red-400 text-2xl mt-2">🔪</p>
                  </>
                )}
              </div>
            )}

            <div className="bg-violet-900/50 border border-violet-700 rounded-xl p-4 mb-6">
              <h2 className="text-white text-2xl font-bold mb-2">DISCUSS 💬</h2>
              {timeLeft !== null && (
                <p className="text-violet-300 font-mono text-3xl">{formatTime(timeLeft)}</p>
              )}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Alive Players</h3>
            <div className="space-y-2">
              {livingPlayers.map((player) => (
                <div
                  key={player.uid}
                  className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3"
                >
                  <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                    {getInitials(player.displayName)}
                  </div>
                  <span className="text-white">{player.displayName}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mt-4">
            <button
              onClick={handleToggleSkipDiscussion}
              disabled={!canSkipVote}
              className={`w-full py-3 rounded-xl font-bold transition-colors ${
                canSkipVote
                  ? mySkipVote
                    ? 'bg-violet-700 hover:bg-violet-600 text-white'
                    : 'bg-violet-600 hover:bg-violet-500 text-white'
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              {mySkipVote ? 'Undo Skip Vote' : 'Skip Discussion'}
            </button>
            <p className="text-slate-300 text-sm mt-3">
              Voted to skip: {skipVotes.length}/{livingPlayers.length}
            </p>
            <div className="flex items-center mt-2">
              {skipVotePlayers.length === 0 ? (
                <span className="text-slate-500 text-sm">No votes yet</span>
              ) : (
                skipVotePlayers.map((player, index) => (
                  <div
                    key={player.uid}
                    className={`w-7 h-7 ${player.avatarColor} rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] text-white font-bold ${index > 0 ? '-ml-2' : ''}`}
                    title={player.displayName}
                  >
                    {getInitials(player.displayName)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Day phase - Voting
  if (gameState?.phase === 'day-vote') {
    const spectator = isSpectator();
    const canVote = !spectator && isCurrentUserAlive();
    const selectablePlayers = getSelectablePlayers();
    const dayVotes = gameState.dayVotes || {};
    const livingVoterUids = new Set(gameState.players.filter((p) => p.isAlive && p.role !== 'narrator').map((p) => p.uid));

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          {spectator && myRole === 'narrator' && (
            <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">🎙️</div>
              <h2 className="text-white font-bold text-xl">NARRATOR</h2>
            </div>
          )}
          {spectator && myRole !== 'narrator' && (
            <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">💀</div>
              <h2 className="text-white font-bold text-xl">YOU ARE DEAD</h2>
            </div>
          )}

          <div className="text-center mb-6">
            <h1 className="text-white text-2xl font-black mb-2">Vote to Eliminate 🗳️</h1>
            {timeLeft !== null && (
              <p className="text-violet-400 font-mono text-3xl">{formatTime(timeLeft)}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {selectablePlayers.filter((player) => player.isAlive === true).map((player) => {
              const votersForPlayer = Object.entries(dayVotes)
                .filter(([voterUid, targetUid]) => targetUid === player.uid && livingVoterUids.has(voterUid))
                .map(([voterUid]) => gameState.players.find((p) => p.uid === voterUid))
                .filter(Boolean);

              return (
              <button
                key={player.uid}
                onClick={() => canVote && handleVotePlayer(player.uid)}
                disabled={!canVote || hasConfirmed}
                className={`flex items-center gap-3 rounded-xl p-4 transition-all ${
                  selectedPlayer === player.uid && canVote
                    ? 'bg-violet-600 ring-2 ring-white'
                    : 'bg-slate-800/50 hover:bg-slate-700'
                } ${(!canVote || hasConfirmed) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`w-12 h-12 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold`}>
                  {getInitials(player.displayName)}
                </div>
                <div className="flex-1">
                  <span className="text-white font-semibold block">{player.displayName}</span>
                  <div className="flex items-center mt-2">
                    {votersForPlayer.map((voter, index) => (
                      <div
                        key={`${player.uid}-${voter.uid}`}
                        className={`w-7 h-7 ${voter.avatarColor} rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] text-white font-bold ${index > 0 ? '-ml-2' : ''}`}
                        title={voter.displayName}
                      >
                        {getInitials(voter.displayName)}
                      </div>
                    ))}
                  </div>
                </div>
              </button>
              );
            })}
          </div>

          {canVote && (
            <button
              onClick={handleConfirmVote}
              disabled={!selectedPlayer || hasConfirmed}
              className="w-full bg-white hover:bg-slate-200 disabled:bg-slate-600 text-slate-900 disabled:text-slate-400 font-bold py-4 rounded-xl transition-colors"
            >
              {hasConfirmed ? 'Vote Confirmed' : 'Confirm Vote'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // End game
  if (gameState?.phase === 'ended') {
    console.log('[MafiaGame] Rendering end game phase', { winner: gameState.winner, playersCount: gameState.players?.length });
    const winner = gameState.winner;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            <div className="text-8xl mb-4">{winner === 'mafia' ? '🔪' : '🎉'}</div>
            <h1 className="text-white text-4xl font-black mb-2">
              {winner === 'mafia' ? 'Mafia Wins!' : 'Town Wins!'}
            </h1>
            <p className="text-slate-400">Game Over</p>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-4">Final Roles</h2>
            <div className="space-y-3">
              {gameState.players.map((player) => (
                <div
                  key={player.uid}
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    player.role === 'mafia' ? 'bg-red-900/30' : 'bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                      {getInitials(player.displayName)}
                    </div>
                    <span className="text-white">{player.displayName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{getRoleIcon(player.role)}</span>
                    <span className={`text-sm font-semibold uppercase ${
                      player.role === 'mafia' ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {player.role}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleReturnToGameNight}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold py-4 rounded-xl transition-colors"
          >
            Return to Game Night
          </button>
        </div>
      </div>
    );
  }

  return null;
}
