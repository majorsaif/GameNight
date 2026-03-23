import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRoom } from '../hooks/useRoom';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { getInitials, getAvatarColor } from '../utils/avatar';
import { throttledUpdate } from '../utils/firestoreThrottle';
import { MAFIA_SOUNDS, playSound } from '../mafia/sounds';
import VotingPanel from './VotingPanel';
import mafiaRoleCardImage from '../assets/mafia/mafia-card.png';
import detectiveRoleCardImage from '../assets/mafia/detective-card.png';
import doctorRoleCardImage from '../assets/mafia/doctor-card.png';
import civilianRoleCardImage from '../assets/mafia/civilian-card.png';
import cardBackImage from '../assets/mafia/card-back.png';
import { KILL_CAUSES, SAVE_CAUSES, KILL_NOTE, SAVE_NOTE } from '../mafia/causes';

export default function MafiaGame() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { room, isHost, loading: roomLoading } = useRoom(roomId, user?.id, user?.displayName, user?.photo || null);
  
  const [gameState, setGameState] = useState(null);
  const [gameStateLoaded, setGameStateLoaded] = useState(false);
  const [myRole, setMyRole] = useState(null);
  const [showRole, setShowRole] = useState(false);
  const [isRoleCardFrontVisible, setIsRoleCardFrontVisible] = useState(false);
  const [isCardFlipping, setIsCardFlipping] = useState(false);
  const [cardRotationY, setCardRotationY] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [readyClicked, setReadyClicked] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const phaseTimerRef = useRef(null);
  const flipTimeoutsRef = useRef([]);
  const phaseTimeoutTriggeredRef = useRef(false);
  const timerJumpedRef = useRef(false);
  const previousPhaseRef = useRef(null);
  const handlePhaseTimeoutRef = useRef(null);

  // DIAGNOSIS FINDINGS:
  // FIX 1: checkAllConfirmed (timer skip) only runs when the HOST confirms via handleConfirmVote.
  //   Ready-to-vote auto-advance works because it has a useEffect watching gameState.readyVotes on the host.
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

  const getPlayerPhoto = (player) => {
    if (!player?.uid) return null;
    const matchingRoomPlayer = room?.players?.find((roomPlayer) => roomPlayer.id === player.uid);
    return player.photo || matchingRoomPlayer?.photo || null;
  };

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
      <div className={`${sizeClasses} ${player.avatarColor} rounded-full flex items-center justify-center text-white font-bold ${textSizeClasses} ${extraClasses}`.trim()}>
        {getInitials(player.displayName)}
      </div>
    );
  };

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

  const getRandomCause = (causes) => {
    if (!Array.isArray(causes) || causes.length === 0) return null;
    return causes[Math.floor(Math.random() * causes.length)];
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
          const roomPlayersByUid = new Map((Array.isArray(data.players) ? data.players : []).map((player) => [player.id, player]));
          const normalizedActivityPlayers = Array.isArray(data.activeActivity.players)
            ? data.activeActivity.players.map((player) => ({
                ...player,
                photo: player.photo || roomPlayersByUid.get(player.uid)?.photo || null
              }))
            : data.activeActivity.players;

          const normalizedActivity = Array.isArray(data.activeActivity.players)
            ? { ...data.activeActivity, players: normalizedActivityPlayers }
            : data.activeActivity;

          setGameState(normalizedActivity);
          setGameStateLoaded(true); // Ensure gameStateLoaded is updated when valid data is received

          const newPhase = data.activeActivity.phase;
          if (newPhase !== previousPhaseRef.current) {
            // Play sound for phase transition
            switch (newPhase) {
              case 'night-eyes-closed':
                playSound(MAFIA_SOUNDS.NIGHT_START);
                break;
              case 'night-mafia':
                playSound(MAFIA_SOUNDS.MAFIA_WAKE);
                break;
              case 'night-doctor':
                playSound(MAFIA_SOUNDS.DOCTOR_WAKE);
                break;
              case 'night-detective':
                playSound(MAFIA_SOUNDS.DETECTIVE_WAKE);
                break;
              case 'day-discussion':
                console.log('[MafiaGame] Playing rooster sound for day start');
                playSound(MAFIA_SOUNDS.DAY_START);
                break;
            }
            
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

  useEffect(() => {
    return () => {
      flipTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  useEffect(() => {
    if (gameState?.phase === 'roles') return;

    flipTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    flipTimeoutsRef.current = [];
    setShowRole(false);
    setIsRoleCardFrontVisible(false);
    setIsCardFlipping(false);
    setCardRotationY(0);
  }, [gameState?.phase]);

  // Host auto-advances discussion if all living players are ready to vote
  useEffect(() => {
    if (!isHost || !gameState || gameState.phase !== 'day-discussion') return;

    const readyVotes = gameState.readyVotes || [];
    const livingUids = gameState.players
      .filter((player) => player.isAlive && player.role !== 'narrator')
      .map((player) => player.uid);

    if (livingUids.length > 0 && livingUids.every((uid) => readyVotes.includes(uid))) {
      const roomRef = doc(db, 'rooms', roomId);
      startDayVotePhase(roomRef);
    }
  }, [isHost, gameState?.phase, gameState?.readyVotes, gameState?.players, roomId]);

  // FIX 1: Host auto-shortens timer if all active players have confirmed votes
  // Mirrors the skip discussion useEffect pattern — reacts to Firestore state changes
  // so it works even when the host is NOT one of the active/voting players.
  useEffect(() => {
    if (!isHost || !gameState) return;
    const phase = gameState.phase;
    if (phase !== 'night-mafia' && phase !== 'night-doctor' && phase !== 'night-detective' && phase !== 'day-vote') return;

    if (timerJumpedRef.current) return; // Prevent repeated timer jumps

    // Inline getActivePlayers logic to avoid stale closure issues
    let activePlayerUids = [];
    switch (phase) {
      case 'night-mafia':
        activePlayerUids = gameState.players.filter(p => p.role === 'mafia' && p.isAlive).map(p => p.uid);
        break;
      case 'night-doctor':
        const doctor = gameState.players.find(p => p.role === 'doctor' && p.isAlive);
        activePlayerUids = doctor ? [doctor.uid] : [];
        break;
      case 'night-detective':
        const detective = gameState.players.find(p => p.role === 'detective' && p.isAlive);
        activePlayerUids = detective ? [detective.uid] : [];
        break;
      case 'day-vote':
        activePlayerUids = gameState.players.filter(p => p.isAlive === true && p.role !== 'narrator').map(p => p.uid);
        break;
      default:
        activePlayerUids = [];
    }
    
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
  }, [isHost, gameState?.phaseEndsAt, gameState?.phase]);

  useEffect(() => {
    const phaseEndsAt = gameState?.phaseEndsAt?.toMillis ? gameState.phaseEndsAt.toMillis() : gameState?.phaseEndsAt;
    console.log('[MafiaGame] phaseEndsAt updated:', { phase: gameState?.phase, phaseEndsAt });
  }, [gameState?.phaseEndsAt, gameState?.phase]);

  // Reset confirmed status and timeout guard when phase changes
  useEffect(() => {
    phaseTimeoutTriggeredRef.current = false;
    if (gameState) {
      setHasConfirmed(gameState.confirmedVotes?.includes(user?.id) || false);
      setReadyClicked(gameState.readyVotes?.includes(user?.id) || false);
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
        case 'night-eyes-closed-2':
          console.log('HOST advancing from night-eyes-closed-2');
          if (activeRules.doctor) {
            await startDoctorPhase(roomRef);
          } else if (activeRules.detective) {
            await startDetectivePhase(roomRef);
          } else {
            await startDayPhase(roomRef);
          }
          break;
        case 'night-doctor':
          console.log('HOST writing phase transition to: night-eyes-closed-3');
          await advanceFromDoctorPhase(roomRef);
          break;
        case 'night-eyes-closed-3':
          console.log('HOST advancing from night-eyes-closed-3');
          if (activeRules.detective) {
            await startDetectivePhase(roomRef);
          } else {
            await startDayPhase(roomRef);
          }
          break;
        case 'night-detective':
          console.log('HOST writing phase transition to: night-detective-result');
          await advanceFromDetectivePhase(roomRef);
          break;
        case 'night-detective-result':
          console.log('HOST advancing from night-detective-result to night-eyes-closed-4');
          await updateDoc(roomRef, {
            'activeActivity.phase': 'night-eyes-closed-4',
            'activeActivity.phaseStartedAt': serverTimestamp(),
            'activeActivity.phaseDurationMs': 3000,
            'activeActivity.phaseEndsAt': Date.now() + 3000,
            lastActivity: serverTimestamp()
          });
          break;
        case 'night-eyes-closed-4':
          console.log('HOST advancing from night-eyes-closed-4 to day');
          await startDayPhase(roomRef);
          break;
        case 'day-discussion':
          console.log('HOST writing phase transition to: day-vote');
          await startDayVotePhase(roomRef);
          break;
        case 'day-vote':
          console.log('HOST writing phase transition to: end-game');
          await processVoteAndCheckWin(roomRef);
          break;
        default:
          console.warn('[handlePhaseTimeout] Unhandled phase:', gameState.phase);
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

  const runRoleCardFlip = (nextFrontVisible) => {
    if (isCardFlipping) return;

    flipTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    flipTimeoutsRef.current = [];

    setIsCardFlipping(true);
    setCardRotationY(90);

    const halfwayTimeout = setTimeout(() => {
      setIsRoleCardFrontVisible(nextFrontVisible);
      setCardRotationY(0);
    }, 300);

    const completeTimeout = setTimeout(() => {
      setShowRole(nextFrontVisible);
      setIsCardFlipping(false);
      flipTimeoutsRef.current = [];
    }, 600);

    flipTimeoutsRef.current = [halfwayTimeout, completeTimeout];
  };

  const handleRevealRole = () => {
    if (showRole || isCardFlipping) return;
    runRoleCardFlip(true);
  };

  const handleHideRole = () => {
    if (!showRole || isCardFlipping) return;
    runRoleCardFlip(false);
  };

  const startNightPhase = async () => {
    if (!isHost) return;
    
    const roomRef = doc(db, 'rooms', roomId);

    // First night includes a 7s volume prompt + 5s eyes-closed. Later nights stay 5s.
    const isFirstNight = (gameState?.roundNumber ?? 1) === 1;
    const nightEyesClosedDurationMs = isFirstNight ? 12000 : 5000;

    await updateDoc(roomRef, {
      'activeActivity.phase': 'night-eyes-closed',
      'activeActivity.phaseStartedAt': serverTimestamp(),
      'activeActivity.phaseDurationMs': nightEyesClosedDurationMs,
      'activeActivity.phaseEndsAt': Date.now() + nightEyesClosedDurationMs,
      'activeActivity.nightVotes': {},
      'activeActivity.mafiaSelections': {},
      'activeActivity.confirmedVotes': [],
      'activeActivity.pendingVictim': null,
      'activeActivity.doctorSave': null,
      'activeActivity.detectiveResult': null,
      lastActivity: serverTimestamp()
    });

    // Advance to mafia turn after the current night-eyes-closed duration.
    setTimeout(async () => {
      await updateDoc(roomRef, {
        'activeActivity.phase': 'night-mafia',
        'activeActivity.phaseStartedAt': serverTimestamp(),
        'activeActivity.phaseDurationMs': 30000,
        'activeActivity.phaseEndsAt': Date.now() + 30000,
        'activeActivity.confirmedVotes': [],
        'activeActivity.nightVotes': {},
        'activeActivity.mafiaSelections': {},
        lastActivity: serverTimestamp()
      });
    }, nightEyesClosedDurationMs);
  };

  const handleVotePlayer = async (targetUid) => {
    if (!user || hasConfirmed || !gameState) return;
    if (!isCurrentUserAlive()) return;
    if (myRole === 'narrator') return;
    
    setSelectedPlayer(targetUid);

    if (gameState.phase === 'night-mafia' && myRole === 'mafia' && !isHost) {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, {
        [`activeActivity.mafiaSelections.${user.id}`]: {
          targetUid,
          confirmed: false
        }
      });
    }
  };

  const handleConfirmVote = async () => {
    if (!user || !selectedPlayer || hasConfirmed || !gameState) return;
    if (!isCurrentUserAlive()) return;
    if (myRole === 'narrator') return;

    const roomRef = doc(db, 'rooms', roomId);
    const voteField = gameState.phase === 'day-vote' ? 'dayVotes' : 'nightVotes';
    const confirmedVotes = Array.from(new Set([...(gameState.confirmedVotes || []), user.id]));
    const updates = {
      [`activeActivity.${voteField}.${user.id}`]: selectedPlayer,
      'activeActivity.confirmedVotes': confirmedVotes,
      lastActivity: serverTimestamp()
    };

    if (gameState.phase === 'night-mafia' && myRole === 'mafia' && !isHost) {
      updates[`activeActivity.mafiaSelections.${user.id}`] = {
        targetUid: selectedPlayer,
        confirmed: true
      };
    }

    await updateDoc(roomRef, updates);

    setHasConfirmed(true);

    if (isHost) {
      await checkAllConfirmed(confirmedVotes);
    }
  };

  const handleSubmitDayVote = async (targetUid) => {
    if (!user || !targetUid || hasConfirmed || !gameState) {
      throw new Error('Vote unavailable');
    }
    if (!isCurrentUserAlive()) {
      throw new Error('Only alive players can vote');
    }
    if (myRole === 'narrator') {
      throw new Error('Narrator cannot vote');
    }

    const roomRef = doc(db, 'rooms', roomId);
    const confirmedVotes = Array.from(new Set([...(gameState.confirmedVotes || []), user.id]));

    await updateDoc(roomRef, {
      [`activeActivity.dayVotes.${user.id}`]: targetUid,
      'activeActivity.confirmedVotes': confirmedVotes,
      lastActivity: serverTimestamp()
    });

    setSelectedPlayer(targetUid);
    setHasConfirmed(true);

    if (isHost) {
      await checkAllConfirmed(confirmedVotes);
    }
  };

  const handleEndDayVoting = async () => {
    if (!isHost || !gameState || gameState.phase !== 'day-vote') return;
    const roomRef = doc(db, 'rooms', roomId);
    await processVoteAndCheckWin(roomRef);
  };

  const checkAllConfirmed = async (confirmedVotesOverride) => {
    if (!isHost || !gameState) return;
    if (timerJumpedRef.current) {
      console.log('[checkAllConfirmed] Timer already jumped for this phase, skipping');
      return;
    }

    const roomRef = doc(db, 'rooms', roomId);
    
    // Inline getActivePlayers logic
    let activePlayerUids = [];
    const phase = gameState.phase;
    switch (phase) {
      case 'night-mafia':
        activePlayerUids = gameState.players.filter(p => p.role === 'mafia' && p.isAlive).map(p => p.uid);
        break;
      case 'night-doctor':
        const doctor = gameState.players.find(p => p.role === 'doctor' && p.isAlive);
        activePlayerUids = doctor ? [doctor.uid] : [];
        break;
      case 'night-detective':
        const detective = gameState.players.find(p => p.role === 'detective' && p.isAlive);
        activePlayerUids = detective ? [detective.uid] : [];
        break;
      case 'day-vote':
        activePlayerUids = gameState.players.filter(p => p.isAlive === true && p.role !== 'narrator').map(p => p.uid);
        break;
      default:
        activePlayerUids = [];
    }
    
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
      'activeActivity.mafiaSelections': {},
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
    const victimPlayer = pendingVictim ? currentPlayers.find((player) => player.uid === pendingVictim) : null;

    let nightReportCause = null;
    let nightReportNote = null;

    if (victimPlayer) {
      if (isSaved) {
        nightReportCause = getRandomCause(SAVE_CAUSES);
        nightReportNote = SAVE_NOTE.replace('[Name]', victimPlayer.displayName);
      } else {
        nightReportCause = getRandomCause(KILL_CAUSES);
        nightReportNote = KILL_NOTE;
      }
    }

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
        'activeActivity.nightReportCause': nightReportCause,
        'activeActivity.nightReportNote': nightReportNote,
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
      'activeActivity.nightReportCause': nightReportCause,
      'activeActivity.nightReportNote': nightReportNote,
      'activeActivity.readyVotes': [],
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
      'activeActivity.readyVotes': [],
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

  const handleReadyToVote = async () => {
    if (!gameState || !user || gameState.phase !== 'day-discussion' || readyClicked) return;
    if (!isCurrentUserAlive() || myRole === 'narrator') return;

    setReadyClicked(true);

    const roomRef = doc(db, 'rooms', roomId);
    const currentReadyVotes = gameState.readyVotes || [];
    const updatedReadyVotes = [...new Set([...currentReadyVotes, user.id])];

    await updateDoc(roomRef, {
      'activeActivity.readyVotes': updatedReadyVotes,
      lastActivity: serverTimestamp()
    });
  };

  const handleStartVotingNow = async () => {
    if (!isHost || !gameState || gameState.phase !== 'day-discussion') return;
    const roomRef = doc(db, 'rooms', roomId);
    await startDayVotePhase(roomRef);
  };

  const handleReturnToGamesNight = async () => {
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
        return gameState.players.filter(p => p.isAlive === true && p.role !== 'narrator');
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
    return Boolean(me && !me.isAlive);
  };

  const isDeadSpectator = () => {
    const me = gameState?.players?.find((player) => player.uid === user?.id);
    return Boolean(me && !me.isAlive && me.role !== 'narrator');
  };

  const renderEliminatedBanner = () => (
    <div className="relative overflow-hidden bg-[#e3d2ad] border border-[#c4ab78] rounded-lg p-4 mb-6 text-center shadow-lg">
      <h2 className="text-black font-serif font-black text-lg uppercase tracking-wide">
        YOU HAVE BEEN
        <span
          className="inline-block align-middle ml-2 border-2 border-[#6d1010] px-2 py-1 text-[#6d1010] text-xs font-black uppercase tracking-widest opacity-95"
          style={{ transform: 'rotate(10deg)' }}
        >
          ELIMINATED
        </span>
      </h2>
    </div>
  );

  const getRoleIcon = (role) => {
    switch (role) {
      case 'mafia':
        return '🔪';
      case 'civilian':
        return '👤';
      case 'doctor':
        return '🩺';
      case 'detective':
        return '🔍';
      default:
        return '❓';
    }
  };

  const getRoleCardImage = (role) => {
    switch (role) {
      case 'mafia':
        return mafiaRoleCardImage;
      case 'detective':
        return detectiveRoleCardImage;
      case 'doctor':
        return doctorRoleCardImage;
      case 'civilian':
        return civilianRoleCardImage;
      default:
        return cardBackImage;
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
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
    const showMafiaCoordination = !isHost;
    
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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
          <div className="w-full max-w-md mx-auto">
            {isDeadSpectator() && renderEliminatedBanner()}

            {myRole === 'narrator' && (
              <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
                <div className="text-4xl mb-2">🎙️</div>
                <h2 className="text-white font-bold text-xl">NARRATOR</h2>
              </div>
            )}

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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
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
    const livingPlayers = gameState.players.filter((p) => p.isAlive && p.role !== 'narrator');
    const readyVotes = gameState.readyVotes || [];
    const canReadyToVote = !spectator && isCurrentUserAlive() && myRole !== 'narrator';
    const myReadyClicked = readyClicked || readyVotes.includes(user?.id);

    return (
      <div className="relative min-h-screen bg-gradient-to-br from-[#020817] via-[#0b1325] to-[#020817] p-6">
        <div
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background: 'radial-gradient(circle at center, rgba(127, 29, 29, 0) 58%, rgba(127, 29, 29, 0.13) 100%)'
          }}
        />

        <div className="relative z-10 w-full max-w-md mx-auto">
          {isDeadSpectator() && renderEliminatedBanner()}

          {spectator && myRole === 'narrator' && (
            <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">🎙️</div>
              <h2 className="text-white font-bold text-xl">NARRATOR</h2>
            </div>
          )}

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
    const spectator = isSpectator();
    const selectablePlayers = getSelectablePlayers().filter((player) => player.isAlive === true && player.role !== 'narrator');
    const dayVotes = gameState.dayVotes || {};
    const formattedTimeLeft = timeLeft !== null ? formatTime(timeLeft) : null;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          {isDeadSpectator() && renderEliminatedBanner()}

          {spectator && myRole === 'narrator' && (
            <div className="bg-purple-900/50 border border-purple-700 rounded-xl p-4 mb-6 text-center">
              <div className="text-4xl mb-2">🎙️</div>
              <h2 className="text-white font-bold text-xl">NARRATOR</h2>
            </div>
          )}

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

  // End game
  if (gameState?.phase === 'ended') {
    console.log('[MafiaGame] Rendering end game phase', { winner: gameState.winner, playersCount: gameState.players?.length });
    const winner = gameState.winner;
    const townWon = winner === 'town';
    const totalPlayers = gameState.players?.length || 0;
    const eliminatedCount = gameState.players?.filter((player) => player.isAlive === false).length || 0;
    const nightsCount = Number.isInteger(gameState?.roundNumber) ? gameState.roundNumber : null;
    const rightMetaText = nightsCount !== null ? `NIGHTS: ${nightsCount}` : `ELIMINATED: ${eliminatedCount}`;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
        <div className="w-full max-w-md mx-auto">
          {/* Newspaper Masthead - Classic Broadsheet Style */}
          <div className="mb-8 text-[#e8e0d0]" style={{ fontFamily: 'serif' }}>
            {/* Top metadata bar */}
            <div className="border-t-2 border-[#e8e0d0]/40 mb-2" style={{ fontSize: '1px' }} />
            <div className="flex items-center justify-between py-1 mb-2 text-[15px] leading-none">
              <span className="font-mono tracking-wider">PLAYERS: {totalPlayers}</span>
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
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: '#3a2a1a' }}>
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
              <div>
                {gameState.players.map((player, idx) => (
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

                      {!player.isAlive && (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-start pl-20 z-10">
                          <span
                            className="border-2 px-3 py-1 text-sm font-black uppercase tracking-[0.18em]"
                            style={{
                              borderColor: '#dc2626',
                              color: '#dc2626',
                              backgroundColor: 'transparent',
                              transform: 'rotate(0deg)'
                            }}
                          >
                            ELIMINATED
                          </span>
                        </div>
                      )}
                    </div>
                    {idx < gameState.players.length - 1 && (
                      <div style={{ height: '1px', backgroundColor: '#8b6b3f', opacity: '0.25' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Return Button */}
          <button
            onClick={handleReturnToGamesNight}
            className="w-full bg-[#e8dcc8] hover:bg-[#f0e5cf] border border-[#c1ab89] text-[#3f3127] font-mono font-bold py-3 rounded-lg transition-colors tracking-wide"
          >
            Return to Its Games Night
          </button>
        </div>
      </div>
    );
  }

  return null;
}
